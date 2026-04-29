import { JAM_PHASES } from "../../domain/jamTimeline.js";
import { BadRequestError, ForbiddenError } from "../../lib/errors.js";

export function assertSuggestionPhase(jamPhase?: string | null) {
  if (jamPhase !== JAM_PHASES.suggestion) {
    throw new ForbiddenError("It's not suggestion phase.");
  }
}

export function assertEliminationPhase(jamPhase?: string | null) {
  if (jamPhase !== JAM_PHASES.elimination) {
    throw new ForbiddenError("Elimination phase is not active");
  }
}

export function assertVotingPhase(jamPhase?: string | null) {
  if (jamPhase !== JAM_PHASES.voting) {
    throw new ForbiddenError("Voting phase is not active");
  }
}

export function assertVotingStillOpen(jamStartTime?: Date | string | null) {
  if (!jamStartTime) {
    return;
  }

  if (
    new Date(jamStartTime).getTime() - new Date().getTime() <=
    24 * 60 * 60 * 1000
  ) {
    throw new BadRequestError("Voting is closed.");
  }
}
