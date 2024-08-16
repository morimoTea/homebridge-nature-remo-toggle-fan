module.exports = (api) => {
  api.registerAccessory('NatureRemoToggleFan', NatureRemoToggleFan);
}

class NatureRemoToggleFan {
  // Constructor (required)
  constructor(log, config, api) {
    // Set essential vars
    this.log = log;
    this.config = config;
    this.api = api;
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    // Extract config
    this.name = config.name;
    this.accessToken = config.accessToken;
    this.powerSignal = config.powerSignal;
    this.maxWindLevel = config.windLevel ? config.windLevel : 1;
    this.windSignal = config.windSignal ? config.windSignal : null;
    this.swingSignal = config.swingSignal ? config.swingSignal : null;

    // Set other vars
    this.uniqueKey = `NRTF-${this.name}`;
    this.speedThresholds = this.calcSpeedThresholds(this.maxWindLevel);
    this.setSpeedDebounced = this.debounce(this.setRotationSpeed.bind(this), 1000);

    // Setup persist state storage
    const storagePath = this.api.user.persistPath();
    this.stateStorage = require('node-persist');
    this.stateStorage.initSync({ dir: storagePath, forgiveParseErrors: true });

    let cachedState = this.stateStorage.getItemSync(this.uniqueKey);
    if (cachedState == undefined) {
      const initState = {
        'active': this.Characteristic.Active.INACTIVE,
        'rotationSpeed': 0,
        'swingMode': this.Characteristic.SwingMode.SWING_DISABLED
      };
      this.stateStorage.setItemSync(this.uniqueKey, initState);
    }

    // Create accessory information
    const { version } = require('./package.json');
    this.informationService = new this.Service.AccessoryInformation()
      .setCharacteristic(this.Characteristic.Manufacturer, 'Homebridge')
      .setCharacteristic(this.Characteristic.SerialNumber, this.uniqueKey)
      .setCharacteristic(this.Characteristic.Model, 'NatureRemoToggleFan')
      .setCharacteristic(this.Characteristic.FirmwareRevision, version);

    // Create Fanv2 service
    this.fanService = new this.Service.Fanv2(this.name);
    this.fanService.getCharacteristic(this.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    if (this.maxWindLevel > 1) {
      this.fanService.getCharacteristic(this.Characteristic.RotationSpeed)
        .onGet(this.getRotationSpeed.bind(this))
        .onSet(this.setSpeedDebounced);
    }

    if (this.swingSignal) {
      this.fanService.getCharacteristic(this.Characteristic.SwingMode)
        .onGet(this.getSwingMode.bind(this))
        .onSet(this.setSwingMode.bind(this));
    }
  }

  // Get exposed service list (required)
  getServices() {
    return [this.informationService, this.fanService];
  }

  // Get current Active characteristic
  getActive() {
    return this.getStateStorage('active');
  }

  // Set current Active characteristic
  setActive(value) {
    if (value == this.getActive()) {
      return;
    }

    this.setStateStorage('active', value);
    this.sendSignal(this.powerSignal);

    if (value) {
      this.log.info('Setting fan to Active');
    } else {
      this.log.info('Setting fan to Inactive');
    }
  }

  // Get current RotationSpeed characteristic
  getRotationSpeed() {
    return this.getStateStorage('rotationSpeed');
  }

  // Set current RotationSpeed characteristic
  setRotationSpeed(value) {
    let currentWindLevel = this.calcWindLevel(this.getRotationSpeed());
    let targetWindLevel = this.calcWindLevel(value);
    if (!targetWindLevel || targetWindLevel == currentWindLevel) {
      return;
    }

    // Send wind signal for multiple times
    this.setStateStorage('rotationSpeed', value);
    let signalCount = (targetWindLevel - currentWindLevel +
      this.maxWindLevel) % this.maxWindLevel;
    for (let i = 0; i < signalCount; i++) {
      this.sendSignal(this.windSignal);
    }

    this.log.info(`Setting fan level to ${targetWindLevel}`);
  }

  // Get current SwingMode characteristic
  getSwingMode() {
    return this.getStateStorage('swingMode');
  }

  // Set current SwingMode characteristic
  setSwingMode(value) {
    if (!this.getActive() || value == this.getSwingMode()) {
      return;
    }

    this.setStateStorage('swingMode', value);
    this.sendSignal(this.swingSignal);

    if (value) {
      this.log.info('Setting fan swing to Enabled');
    } else {
      this.log.info('Setting fan swing to Disabled');
    }
  }

  // Get state from persist storage
  getStateStorage(key) {
    let state = this.stateStorage.getItemSync(this.uniqueKey);
    return state[key];
  }

  // Set state to persist storage
  setStateStorage(key, value) {
    var state = this.stateStorage.getItemSync(this.uniqueKey);
    state[key] = value;
    this.stateStorage.setItemSync(this.uniqueKey, state);
  }

  // Calculate rotation speed thresholds list
  calcSpeedThresholds(maxWindLevel) {
    let speedRange = 100 / maxWindLevel;
    var speedThresholds = [0, 0];
    for (let i = 1; i < maxWindLevel; i++) {
      speedThresholds.push(Math.floor(speedRange * i));
    }
    speedThresholds.push(100);

    return speedThresholds;
  }

  // Calculate wind level from rotation speed
  calcWindLevel(rotationSpeed) {
    for (let level = 0; level <= this.maxWindLevel; level++) {
      if (rotationSpeed >= this.speedThresholds[level] &&
        rotationSpeed <= this.speedThresholds[level + 1]) {
        return level;
      }
    }
  }

  // Make function debounced
  debounce(func, wait) {
    let timeout;

    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        clearTimeout(timeout);
        func(...args);
      }, wait);
    };
  }

  // Send signal via API
  sendSignal(signal) {
    const https = require('https');
    const url = new URL(`https://api.nature.global/1/signals/${signal}/send`);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      },
    };

    const req = https.request(options, (res) => {
      switch (res.statusCode) {
        case 200:
          this.log.debug('API request success (200)');
          break;
        case 401:
          this.log.warn('Invalid API access token (401)');
          break;
        case 404:
          this.log.warn('Invalid signal ID (404)');
          break;
        case 429:
          this.log.warn('Reached API rate limit (429)');
          break;
        default:
          this.log.warn(`Failed API request (${res.statusCode})`);
          break;
      }
    });

    req.on('error', (e) => {
      this.log.error(`Failed API request: ${e}`);
    });

    req.end();
  }
}