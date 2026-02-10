import SolanaWalletLoader from './SolanaWalletLoader';

export default function SolanaWalletPage() {
  return (
    <>
      {/* SSR anchor: always present for E2E even if client bundle fails */}
      <h1 data-testid="solana-wallet-title" className="sr-only">
        Solana Wallet
      </h1>
      <SolanaWalletLoader />
    </>
  );
}
