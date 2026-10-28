// preload.js — Secure IPC bridge between main and renderer
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('agentOS', {
  // Agent status
  getDirectorSummary: ()             => ipcRenderer.invoke('agents:directorSummary'),
  getHealth:     ()              => ipcRenderer.invoke('agents:health'),
  startAgents:   ()              => ipcRenderer.invoke('agents:start'),
  stopAgents:    ()              => ipcRenderer.invoke('agents:stop'),
  triggerAgent:  (agent, trigger, message) => ipcRenderer.invoke('agent:trigger', { agent, trigger, message }),
  ask:           (message)       => ipcRenderer.invoke('orchestrator:ask', message),
  getAgentChat:  ()               => ipcRenderer.invoke('agents:chatGet'),
  sendAgentChat: (message)        => ipcRenderer.invoke('agents:chatSend', message),

  offlineStatus: ()                                => ipcRenderer.invoke('offline:status'),
  offlineModels: ()                                => ipcRenderer.invoke('offline:models'),
  offlineChat:   (model, message, standalonePort)  => ipcRenderer.invoke('offline:chat', { model, message, standalonePort }),
  offlineStart:  (modelPath, port)                 => ipcRenderer.invoke('offline:standaloneStart', { modelPath, port }),
  offlineStop:   (port)                            => ipcRenderer.invoke('offline:standaloneStop', { port }),

  // Vault
  readNote:      (path)          => ipcRenderer.invoke('vault:read', path),
  listNotes:     (folder)        => ipcRenderer.invoke('vault:list', folder),
  getVaultGraph: (opts)          => ipcRenderer.invoke('vault:graph', opts),
  uploadToVault: (sourcePath, name) => ipcRenderer.invoke('vault:upload', sourcePath, name),

  // AI Chat
  aiChat:        (prompt)        => ipcRenderer.invoke('ai:chat', prompt),
  saveChat:      (userMessage, aiResponse) => ipcRenderer.invoke('chat:save', { userMessage, aiResponse }),
  loadChat:      ()              => ipcRenderer.invoke('chat:load'),

  // System stats
  getSystemStats: ()             => ipcRenderer.invoke('system:stats'),
  getUptime:      ()             => ipcRenderer.invoke('system:uptime'),

  // Window controls
  minimize:      ()              => ipcRenderer.send('window:minimize'),
  maximize:      ()              => ipcRenderer.send('window:maximize'),
  close:         ()              => ipcRenderer.send('window:close'),
  quit:          ()              => ipcRenderer.send('window:quit'),
})
