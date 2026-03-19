import { loadEnv } from './bootstrapEnv';

loadEnv();

process.env['CANARY_ENABLED'] = process.env['CANARY_ENABLED'] || 'true';
process.env['CANARY_NOTIONAL_ETH'] = process.env['CANARY_NOTIONAL_ETH'] || '0.01';
process.env['CANARY_MAX_DAILY_LOSS_ETH'] = process.env['CANARY_MAX_DAILY_LOSS_ETH'] || '0.005';

console.log('🧪 ArbiMind bot CANARY bootstrap');
console.log(`   CANARY_ENABLED=${process.env['CANARY_ENABLED']}`);
console.log(`   CANARY_NOTIONAL_ETH=${process.env['CANARY_NOTIONAL_ETH']}`);
console.log(`   CANARY_MAX_DAILY_LOSS_ETH=${process.env['CANARY_MAX_DAILY_LOSS_ETH']}`);

void import('./index.js');
