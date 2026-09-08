'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(projectRoot, 'cloudfunctions', 'pvpService', 'deployment-manifest.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function exists(relativePath) {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

function checkSourceContract(manifest) {
  const sourcePath = path.join(projectRoot, manifest.function.source, 'index.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const economySource = fs.readFileSync(path.join(projectRoot, manifest.function.source, 'economy.js'), 'utf8');
  const missingCollections = [...manifest.collections, ...(manifest.existingCollectionDependencies || [])].filter((name) => !(source + economySource).includes(`'${name}'`));
  const requiredActions = [
    'getProfile', 'getRankedLevel', 'matchmake', 'createFriendChallenge', 'joinFriendChallenge', 'getMatch',
    'getActiveMatch', 'saveCheckpoint', 'getOpponentState', 'cancelMatch', 'submitResult',
    'getLeaderboard', 'getHistory', 'getEconomy', 'beginTicketReward', 'claimTicketReward', 'claimRankReward',
  ];
  const missingActions = requiredActions.filter((action) => !source.includes(`case '${action}'`));
  return { missingCollections, missingActions };
}

function inspectCredentials() {
  const hasSecretId = Boolean(process.env.TCB_SECRET_ID);
  const hasSecretKey = Boolean(process.env.TCB_SECRET_KEY);
  return {
    envId: Boolean(process.env.TCB_ENV_ID),
    deployCredentialPair: hasSecretId && hasSecretKey,
    gatewayApiKey: Boolean(process.env.TCB_API_KEY),
  };
}

function inspectWeChatBuildConfig() {
  const configPath = path.join(projectRoot, 'build', 'wechatgame', 'project.config.json');
  if (!fs.existsSync(configPath)) return { present: false, cloudfunctionRoot: '' };
  const config = readJson(configPath);
  return { present: true, cloudfunctionRoot: String(config.cloudfunctionRoot || '') };
}

function main() {
  const failures = [];
  if (!fs.existsSync(manifestPath)) failures.push('deployment manifest is missing');
  if (failures.length > 0) {
    console.error(JSON.stringify({ ready: false, failures }, null, 2));
    process.exitCode = 2;
    return;
  }

  const manifest = readJson(manifestPath);
  const requiredFiles = [
    `${manifest.function.source}/index.js`,
    `${manifest.function.source}/core.js`,
    `${manifest.function.source}/economy.js`,
    `${manifest.function.source}/matchmaking.js`,
    `${manifest.function.source}/replay-validation.js`,
    `${manifest.function.source}/bot-runtime/PvpHumanReplay.js`,
    `${manifest.function.source}/bot-runtime/PchConveyorGeometry.js`,
    `${manifest.function.source}/bot-runtime/levels/catalog.json`,
    `${manifest.function.source}/package.json`,
  ];
  for (const filePath of requiredFiles) {
    if (!exists(filePath)) failures.push(`missing ${filePath}`);
  }

  const packageJson = readJson(path.join(projectRoot, manifest.function.source, 'package.json'));
  if (!packageJson.dependencies?.['wx-server-sdk']) failures.push('wx-server-sdk dependency is missing');

  const sourceContract = checkSourceContract(manifest);
  for (const name of sourceContract.missingCollections) failures.push(`source does not own collection ${name}`);
  for (const action of sourceContract.missingActions) failures.push(`source does not expose action ${action}`);

  const credentials = inspectCredentials();
  if (!credentials.envId) failures.push('TCB_ENV_ID is not configured');
  if (!credentials.deployCredentialPair) failures.push('TCB_SECRET_ID/TCB_SECRET_KEY deployment credentials are not configured');

  const buildConfig = inspectWeChatBuildConfig();
  if (!buildConfig.present) failures.push('WeChat build project.config.json is missing');
  if (buildConfig.present && buildConfig.cloudfunctionRoot.replace(/\/+$/, '') !== 'cloudfunctions') {
    failures.push('WeChat cloudfunctionRoot is not cloudfunctions');
  }

  const report = {
    ready: failures.length === 0,
    functionName: manifest.function.name,
    collections: manifest.collections.length,
    indexes: manifest.indexes.length,
    sourceContract,
    credentials,
    buildConfig,
    failures,
    note: 'credentials are reported as booleans only; no secret value is printed',
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 2;
}

main();
