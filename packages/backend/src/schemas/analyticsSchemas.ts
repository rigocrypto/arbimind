import Joi from 'joi';

const FUNNEL_EVENTS = [
  'landing_view',
  'wallet_connect_click',
  'wallet_connected',
  'first_opportunity_view',
  'canary_start_clicked',
] as const;

export const funnelEventSchema = Joi.object({
  name: Joi.string().valid(...FUNNEL_EVENTS).required(),
  properties: Joi.object().unknown(true).default({}),
  ts: Joi.date().iso().optional(),
  path: Joi.string().max(300).optional(),
  sessionId: Joi.string().max(120).optional(),
  userAddress: Joi.string().max(120).optional(),
  ctaVariant: Joi.string().valid('A', 'B').optional(),
  source: Joi.string().max(30).default('ui'),
});
