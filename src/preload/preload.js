'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rayclone', {
  search: (query) => ipcRenderer.invoke('search', query),
  execute: (id, actionId) => ipcRenderer.invoke('execute', { id, actionId }),
  getPreview: (id) => ipcRenderer.invoke('preview:get', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  validateHotkey: (key) => ipcRenderer.invoke('settings:validate-hotkey', key),
  hide: () => ipcRenderer.invoke('hide'),
  quit: () => ipcRenderer.invoke('quit'),
  info: () => ipcRenderer.invoke('info'),
  onShown: (cb) => ipcRenderer.on('launcher:shown', () => cb()),
  onHidden: (cb) => ipcRenderer.on('launcher:hidden', () => cb()),
  onOpenSettings: (cb) => ipcRenderer.on('launcher:open-settings', () => cb()),
  onSettingsChanged: (cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),
  hudDetach: (payload) => ipcRenderer.invoke('hud:detach', payload),
  hudClose: () => ipcRenderer.invoke('hud:close'),
  hudGetPayload: () => ipcRenderer.invoke('hud:get-payload'),
  onHudLoad: (cb) => ipcRenderer.on('hud:load', (_e, data) => cb(data)),
  onHudRequestDetach: (cb) => ipcRenderer.on('hud:request-detach', () => cb())
});
