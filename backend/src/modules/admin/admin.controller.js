import * as admin from './admin.service.js';
import * as setupCode from './setupCode.service.js';

export async function setupStatus(_req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await admin.setupStatus());
}

export async function setup(req, res) {
  res.status(201).json(await admin.createFirstAdmin(req.body, req));
}

export async function recoveryLookup(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await admin.recoveryLookup(req.body, req));
}

export async function recover(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await admin.recoverAdmin(req.body, req));
}

export async function security(_req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await setupCode.securityOverview());
}

export async function changeSetupCode(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await setupCode.changeSetupCode(req.auth.userId, req.body, req));
}

export async function removeSetupCode(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await setupCode.removePanelCode(req.auth.userId, req.body, req));
}

export async function stats(_req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await admin.stats());
}

export async function users(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await admin.listUsers(req.query));
}

export async function auditLogs(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await admin.listAuditLogs(req.query));
}
