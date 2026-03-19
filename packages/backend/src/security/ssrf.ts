import { isIP } from 'node:net';

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  '169.254.169.254',
]);

const BLOCKED_IPV4_PREFIXES = [
  '10.',
  '127.',
  '169.254.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '192.168.',
];

function normalizeHosts(hosts: readonly string[]): string[] {
  return hosts
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function isBlockedIpLiteral(host: string): boolean {
  const version = isIP(host);
  if (!version) return false;

  if (version === 4) {
    return BLOCKED_IPV4_PREFIXES.some((prefix) => host.startsWith(prefix));
  }

  const normalized = host.toLowerCase();
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
}

export function getEnvHostAllowlist(envKey: string): string[] {
  const raw = process.env[envKey]?.trim();
  if (!raw) return [];

  return raw
    .split(/[\s,]+/)
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function assertAllowedOutboundUrl(rawUrl: string, allowedHosts: readonly string[]): URL {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid outbound URL');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Only https outbound URLs are allowed');
  }

  if (url.username || url.password) {
    throw new Error('Credentialed outbound URLs are not allowed');
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || isBlockedIpLiteral(hostname)) {
    throw new Error('Outbound URL host is blocked');
  }

  const normalizedAllowlist = normalizeHosts(allowedHosts);
  if (!normalizedAllowlist.includes(hostname)) {
    throw new Error('Outbound URL host is not allowlisted');
  }

  return url;
}