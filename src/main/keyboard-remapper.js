'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function getHyperKeyInfo() {
  return {
    title: 'Hyper Key (Caps Lock -> Ctrl+Shift+Alt+Win)',
    description: 'Turns the rarely-used Caps Lock key into a universal modifier for conflict-free global shortcuts.',
    methods: [
      {
        name: 'PowerToys Keyboard Manager',
        recommended: true,
        steps: [
          'Open Microsoft PowerToys > Keyboard Manager',
          'Click "Remap a key"',
          'Select "Caps Lock" and remap to "Ctrl + Shift + Alt + Win" (Hyper)'
        ]
      },
      {
        name: 'Windows Registry Scancode Map (Direct Hardware Remap)',
        recommended: false,
        registryKey: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Keyboard Layout',
        valueName: 'Scancode Map',
        hexBinary: '00 00 00 00 00 00 00 00 02 00 00 00 1d 00 3a 00 00 00 00 00'
      }
    ]
  };
}

function generateRegistryScript() {
  return `Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Keyboard Layout]
; Remaps Caps Lock (003a) to Left Ctrl (001d)
"Scancode Map"=hex:00,00,00,00,00,00,00,00,02,00,00,00,1d,00,3a,00,00,00,00,00
`;
}

module.exports = {
  getHyperKeyInfo,
  generateRegistryScript
};
