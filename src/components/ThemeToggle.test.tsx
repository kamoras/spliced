import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeToggle from './ThemeToggle.jsx';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('toggles the document theme and persists the choice', async () => {
    render(<ThemeToggle />);
    // Defaults to light (matchMedia stub reports no dark preference).
    const button = screen.getByRole('button', {
      name: /switch to dark theme/i,
    });

    await userEvent.click(button);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('spliced:theme')).toBe('dark');

    await userEvent.click(
      screen.getByRole('button', { name: /switch to light theme/i })
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
