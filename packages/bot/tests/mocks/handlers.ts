import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('*/api/opportunities', () => {
    return HttpResponse.json([
      {
        id: 'arb-001',
        profitPct: 1.2,
        inputToken: 'SOL',
        outputToken: 'USDC',
        routes: [{ dex: 'jupiter', slippage: 0.5 }]
      }
    ]);
  }),

  http.post('*/api/solana/tx/transfer', async ({ request }) => {
    const body = await request.json();
    const amountSol = typeof body?.amountSol === 'number' ? body.amountSol : 1;

    return HttpResponse.json({
      transactionBase64: 'mock-base64-tx-v0',
      recentBlockhash: 'mock-blockhash',
      lastValidBlockHeight: 123456,
      feeLamports: amountSol * 1_000_000 * 0.005
    });
  }),

  http.post('*/api/execute', () => {
    return HttpResponse.json({ success: true, txHash: '0xmock-tx' });
  }),

  http.post('*/api/ai/predict-arb', async ({ request }) => {
    const body = await request.json() as { profitPct?: number };
    const profitPct = typeof body?.profitPct === 'number' ? body.profitPct : 0;
    return HttpResponse.json({
      success: true,
      data: {
        expectedProfitPct: profitPct * 0.8,
        successProb: profitPct > 1 ? 0.9 : 0.4,
        recommendation: 'EXECUTE'
      }
    });
  })
];
