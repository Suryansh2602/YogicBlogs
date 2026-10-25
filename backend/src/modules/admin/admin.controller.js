import * as admin from './admin.service.js';

export async function setupStatus(_req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await admin.setupStatus());
}

export async function setup(req, res) {
  res.status(201).json(await admin.createFirstAdmin(req.body, req));
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
