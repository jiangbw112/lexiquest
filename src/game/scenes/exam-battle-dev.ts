/**
 * Dev-server only. Production builds drop this module with the DEV guard.
 * The banner never calls into here.
 */
export interface ExamDevHooks {
  closeIntro: () => void;
  answerCorrect: () => void;
  act: () => void;
  continuePhase: () => void;
}

export function attachExamDev(hooks: ExamDevHooks): void {
  (window as unknown as { __LEXI_EXAM__?: ExamDevHooks }).__LEXI_EXAM__ = hooks;
}

export function detachExamDev(): void {
  const slot = window as unknown as { __LEXI_EXAM__?: ExamDevHooks };
  delete slot.__LEXI_EXAM__;
}
