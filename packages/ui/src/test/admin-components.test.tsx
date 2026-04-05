import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SimulationBanner } from '../components/admin/SimulationBanner';
import { EmergencyStopButton } from '../components/admin/EmergencyStopButton';
import { EngineHealthPanel } from '../components/admin/EngineHealthPanel';

describe('SimulationBanner', () => {
  it('renders warning when engineMode is simulation', () => {
    render(<SimulationBanner engineMode="simulation" />);
    expect(screen.getByText(/Simulation Mode/)).toBeInTheDocument();
  });

  it('renders unknown warning when engineMode is unknown', () => {
    render(<SimulationBanner engineMode="unknown" />);
    expect(screen.getByText(/Engine mode unknown/)).toBeInTheDocument();
  });

  it('renders nothing when engineMode is live', () => {
    const { container } = render(<SimulationBanner engineMode="live" />);
    expect(container.firstChild).toBeNull();
  });
});

describe('EmergencyStopButton', () => {
  it('renders the stop button', () => {
    render(<EmergencyStopButton onStopped={() => {}} />);
    expect(screen.getByRole('button', { name: /emergency stop/i })).toBeInTheDocument();
  });

  it('shows confirmation on click', () => {
    render(<EmergencyStopButton onStopped={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /emergency stop/i }));
    expect(screen.getByText(/Confirm Emergency Stop/i)).toBeInTheDocument();
  });
});

describe('EngineHealthPanel', () => {
  it('shows mode badge with SIMULATION', () => {
    render(
      <EngineHealthPanel
        engineDetail={null}
        rpcHealth={null}
        engineBlocked={false}
        engineMode="simulation"
      />
    );
    expect(screen.getByText(/SIMULATION/)).toBeInTheDocument();
    expect(screen.getByText(/STOPPED/)).toBeInTheDocument();
  });

  it('shows RUNNING (LIVE) when active and live', () => {
    render(
      <EngineHealthPanel
        engineDetail={{
          active: 'arbitrage',
          walletChain: null,
          walletAddress: null,
          oppsCount: 3,
          lastProfit: 0.05,
          lastScanAt: Date.now() - 5000,
          uptime: 3600,
          timestamp: Date.now(),
        }}
        rpcHealth={null}
        engineBlocked={false}
        engineMode="live"
      />
    );
    expect(screen.getByText(/RUNNING/)).toBeInTheDocument();
    expect(screen.getByText(/LIVE/)).toBeInTheDocument();
  });

  it('shows blocked warning when engineBlocked', () => {
    render(
      <EngineHealthPanel
        engineDetail={null}
        rpcHealth={null}
        engineBlocked={true}
        blockedReason="Test block reason"
      />
    );
    expect(screen.getByText(/Test block reason/)).toBeInTheDocument();
  });
});
