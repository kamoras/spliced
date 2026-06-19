import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HowToPlay from './HowToPlay.jsx';

describe('HowToPlay', () => {
  it('renders as a labelled modal dialog', () => {
    render(<HowToPlay onClose={() => {}} />);
    expect(
      screen.getByRole('dialog', { name: /how to play/i })
    ).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<HowToPlay onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(<HowToPlay onClose={onClose} />);
    await userEvent.click(
      screen.getByRole('button', { name: /close how to play/i })
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
