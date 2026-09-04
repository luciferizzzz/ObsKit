# ObsKit v1.5.7

## Bug Fix

- `obs ai tomorrow` now outputs exactly the activities entered by the user (no more, no fewer). The AI no longer invents extra activities, breaks, or unrelated tasks. Name, time, priority, goal, and notes are repeated verbatim from the user input.
- Fixed CLI version-assertion tests that hardcoded a version string; they now read the current version from `package.json`, so they no longer fail on release.

## Testing

- `obs ai tomorrow` prompt tests and all AI workflow tests pass.

## Notes

This release fixes the `obs ai tomorrow` bug where the AI generated a schedule that did not match the user's input.
