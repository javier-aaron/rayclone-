'use strict';

const store = require('./store');
const { exec } = require('node:child_process');
const { shell } = require('electron');
const path = require('node:path');

const DEFAULT_PROJECTS = [
  {
    id: 'proj-rayclone',
    name: 'Rayclone Core Development',
    directory: 'c:\\Users\\Jay\\WorkBuddy AI\\rea\\rayclone',
    vscode: true,
    terminal: true,
    browserUrl: '',
    devCommand: 'npm start'
  }
];

let projects = [...DEFAULT_PROJECTS];

function init() {
  const loaded = store.read('projects', null);
  if (Array.isArray(loaded)) {
    projects = loaded;
  } else {
    store.write('projects', projects);
  }
}

function listProjects() {
  return [...projects];
}

function addProject(project) {
  if (!project || !project.name) return false;
  const id = project.id || `proj-${Date.now()}`;
  projects.push({ ...project, id });
  store.write('projects', projects);
  return id;
}

function deleteProject(id) {
  const idx = projects.findIndex((p) => p.id === id);
  if (idx !== -1) {
    projects.splice(idx, 1);
    store.write('projects', projects);
    return true;
  }
  return false;
}

async function launchProject(id) {
  const proj = projects.find((p) => p.id === id);
  if (!proj) return { ok: false, error: 'project not found' };

  const actionsTaken = [];
  const dir = proj.directory;

  if (proj.vscode && dir) {
    exec(`code "${dir}"`);
    actionsTaken.push('VS Code opened');
  }

  if (proj.terminal && dir) {
    exec(`wt.exe -d "${dir}"`);
    actionsTaken.push('Terminal opened');
  }

  if (proj.browserUrl) {
    shell.openExternal(proj.browserUrl);
    actionsTaken.push(`Browser navigated to ${proj.browserUrl}`);
  }

  if (proj.devCommand && dir) {
    exec(`cd /d "${dir}" && ${proj.devCommand}`);
    actionsTaken.push(`Dev command executed: ${proj.devCommand}`);
  }

  return { ok: true, project: proj.name, actionsTaken };
}

init();

module.exports = {
  init,
  listProjects,
  addProject,
  deleteProject,
  launchProject,
  DEFAULT_PROJECTS
};
