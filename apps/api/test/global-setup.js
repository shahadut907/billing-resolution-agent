const fs = require('node:fs');
const path = require('node:path');

/**
 * Jest globalSetup for the e2e suite: probe database availability once and
 * record it in a marker file. The spec file reads the marker and reports the
 * whole suite as skipped (not passing) when no database is reachable.
 */
module.exports = async function globalSetup() {
  const statusPath = path.join(__dirname, '.db-status');
  try {
    const { PrismaClient } = require('@billing-resolution/db');
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    fs.writeFileSync(statusPath, 'up');
  } catch (error) {
    fs.writeFileSync(statusPath, 'down');
  }
};
