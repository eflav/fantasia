const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

export const BANNER = `${GREEN}
  ╔══════════════════════════════════════════════════════╗
  ║  FANTASIA — self-managing workflow                   ║
  ║  paste a vague story; it drives itself to done       ║
  ║  memory: .fantasia/   artifacts: ./workspace/        ║
  ╚══════════════════════════════════════════════════════╝
${RESET}${DIM}  type a user story, or: help | history | memory | status | retry | demo | quit
${RESET}`;

export function prompt(): string {
  return `${GREEN}$ fantasia>${RESET} `;
}
