# draw Specification

## Purpose
Computing, re-running, and revealing assignments, including constraint handling, feasibility checks, the last-year rule, secrecy guarantees, and the draw notification.

## Requirements
### Requirement: Host runs the draw
Only the host SHALL be able to run the draw. It SHALL require at least 3 participants and SHALL be allowed whether the exchange is `open` or already `drawn`. Running it SHALL, in a single transaction, delete any existing assignments of the exchange, store the new ones and set the status to `drawn`. Running it again on a `drawn` exchange is a full redraw.

#### Scenario: First draw
- **WHEN** the host runs the draw on an open exchange with 6 participants
- **THEN** the exchange becomes `drawn` with 6 assignments

#### Scenario: Redraw
- **WHEN** the host runs the draw on a `drawn` exchange
- **THEN** all previous assignments are replaced by a new set

#### Scenario: Too few participants
- **WHEN** the host runs the draw with 2 participants
- **THEN** the system rejects it and nothing changes

#### Scenario: Non-host
- **WHEN** a participant who is not the host tries to run the draw
- **THEN** the system rejects it

### Requirement: Valid assignment
A draw SHALL give every participant exactly one receiver and every participant exactly one giver. Nobody SHALL draw themselves, and no assignment SHALL violate an exclusion rule in either direction. Sub-loops such as A→B, B→A are allowed.

#### Scenario: Constraints respected
- **WHEN** a draw completes for a group with rule Rosalie–Marc
- **THEN** each participant gives to exactly one other participant, receives from exactly one, and neither Rosalie→Marc nor Marc→Rosalie occurs

### Requirement: Random result
The draw SHALL be random. Every valid assignment SHALL have a non-zero chance of being produced. A perfectly uniform distribution is not required.

#### Scenario: Repeated draws differ
- **WHEN** several valid assignments exist and the draw is run many times on the same participants and rules
- **THEN** more than one distinct assignment is produced

### Requirement: Impossible draw
If no valid assignment exists, the system SHALL reject the draw with a clear message and SHALL leave the exchange and its existing assignments unchanged.

#### Scenario: Rules leave no solution
- **WHEN** rules A–B and A–C were added while D was a participant, and the host then removes D, leaving A with nobody to draw
- **THEN** the system answers "no draw is possible with these rules" and the status and assignments stay as they were

### Requirement: Avoid last year's receiver
When the group has a previous exchange that was drawn (the most recent one with an earlier year), the draw SHALL try to avoid giving any participant the same receiver as in that exchange. This rule SHALL be best-effort: if no valid assignment satisfies it, the draw SHALL silently fall back to ignoring it. The derived rule SHALL NOT be stored and SHALL NOT be visible to anyone.

#### Scenario: History respected
- **WHEN** Julie gave to Paul last year and a valid draw exists that avoids it
- **THEN** Julie does not draw Paul this year

#### Scenario: History impossible to respect
- **WHEN** avoiding last year's pairs leaves no valid assignment but the exclusion rules alone do
- **THEN** the draw succeeds with a valid assignment and no message reveals that the history rule was relaxed

#### Scenario: Host cannot see history
- **WHEN** the host views the group's rules
- **THEN** only the rules they added are shown

### Requirement: Secrecy of assignments
Each user SHALL be able to read only the assignment where they are the giver. The host SHALL have no additional access to assignments. No user SHALL be able to create, edit or delete assignments directly; only the draw and reset actions change them. The superuser (admin dashboard) SHALL be able to see all assignments.

#### Scenario: Participant lists assignments
- **WHEN** a participant requests the assignments of the exchange
- **THEN** only their own assignment is returned

#### Scenario: Host lists assignments
- **WHEN** the host requests the assignments of the exchange
- **THEN** only the host's own assignment is returned

#### Scenario: Forged assignment
- **WHEN** any user attempts to create or modify an assignment through the API
- **THEN** the system rejects it

### Requirement: See who you drew, anytime
Once an exchange is `drawn`, each participant SHALL be able to see their receiver's display name and wish list at any time after logging in.

#### Scenario: Forgot who I drew
- **WHEN** a participant logs in weeks after the draw and opens the exchange
- **THEN** they see their receiver's name and that person's wish list

### Requirement: Reset the draw
The host SHALL be able to reset a `drawn` exchange: all its assignments SHALL be deleted and its status SHALL return to `open`, so participants and rules can be edited before drawing again.

#### Scenario: Late joiner
- **WHEN** the host resets a drawn exchange, invites a new member and runs the draw
- **THEN** the new member is included and everyone has a fresh assignment

### Requirement: Draw notification
After a successful draw, the system SHALL email every participant that the draw is done and that they can log in to see who they got. The email SHALL NOT contain any participant's name or assignment. An email delivery failure SHALL NOT undo the draw.

#### Scenario: Draw email
- **WHEN** a draw succeeds
- **THEN** every participant receives an email with no names in it

#### Scenario: Mail server down
- **WHEN** the draw succeeds but sending email fails
- **THEN** the assignments remain saved and the failure is logged
