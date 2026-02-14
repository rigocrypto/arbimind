import { http, createConfig } from 'wagmi';
import { mainnet, polygon, polygonAmoy } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'demo-project-id';

export const config = createConfig({
  chains: [mainnet, polygon, polygonAmoy],
  connectors: [
    injected(),
    walletConnect({ projectId }),
  ],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [polygonAmoy.id]: http('https://rpc-amoy.polygon.technology'),
  },
  ssr: true, // important for Next.js SSR
});
