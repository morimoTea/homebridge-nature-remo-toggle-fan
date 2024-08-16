# Homebridge Nature Remo Toggle Fan
[Homebridge](https://github.com/homebridge/homebridge) plugin to control toggle-type fans using [Nature Remo](https://nature.global/nature-remo/).

## Installation
Search `Nature Remo Toggle Fan` in the Plugin tab of the Homebridge UI.

## Configuration
This plugin supports GUI configuration in the Homebridge UI.  
Manual configuration with `config.json` is also available.
```json:config.json
  "accessories": [
    {
      "name": "Living Room's Fan",
      "accessToken": "[Nature Remo Cloud API Access Token]",
      "powerSignal": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "windLevel": 3,
      "windSignal": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "swingSignal": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "accessory": "NatureRemoToggleFan"
    }
  ]
```
- `name` can be set whatever you want
- `windLevel` must be more than 1  
1 will disable the wind level control
- `windSignal` is required if `windLevel` is more than 2
- `swingSignal` is optional
- `accessory` must be `NatureRemoToggleFan`
- To obtain `accessToken`, log in to https://home.nature.global/ with your Nature account
- To obtain `powerSignal`, `windSignal` and `swingSignal`, run the following command and look for the relevant `id` key  
```
curl -X GET "https://api.nature.global/1/appliances" -H "Authorization: Bearer [accessToken]"
```