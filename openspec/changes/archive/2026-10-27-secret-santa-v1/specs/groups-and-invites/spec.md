## ADDED Requirements

### Requirement: Create a group
Any logged-in user SHALL be able to create a group with a name. The creator SHALL become the group's only host and SHALL be a member of it. The host cannot be changed.

#### Scenario: Create group
- **WHEN** a logged-in user creates a group named "Famille Perron"
- **THEN** the group exists with that user as host and as its first member

### Requirement: Group visibility
A group, its member list and its exchanges SHALL be visible only to its members.

#### Scenario: Member views group
- **WHEN** a member opens the group
- **THEN** they see its name, members and exchanges

#### Scenario: Non-member
- **WHEN** a user who is not a member requests the group
- **THEN** the system returns nothing for it

### Requirement: Invite a member
Only the host SHALL be able to invite someone by email and display name. Inviting SHALL create the user if no user has that email, add them to the group's members, add them to the participants of the group's open exchange if there is one, and send an invitation email. The invitation email SHALL point to the app and SHALL NOT contain a login link.

#### Scenario: Invite new person
- **WHEN** the host invites "marc@example.com" as "Marc"
- **THEN** a user Marc is created, added to the group, and receives an invitation email telling them to log in with their email

#### Scenario: Invite existing user
- **WHEN** the host invites an email that already belongs to a user
- **THEN** that existing user is added to the group and no duplicate user is created

#### Scenario: Invite during an open exchange
- **WHEN** the host invites someone while the group has an open exchange
- **THEN** the new member is also a participant of that exchange

#### Scenario: Already a member
- **WHEN** the host invites an email that is already a member of the group
- **THEN** the system rejects the invite with a message and sends nothing

#### Scenario: Non-host tries to invite
- **WHEN** a member who is not the host attempts to invite someone
- **THEN** the system rejects the request

### Requirement: Yearly exchange
The host SHALL be able to create an exchange for a given year. A group SHALL have at most one exchange per year. A new exchange SHALL start in status `open` with its participants pre-filled from the group's current members.

#### Scenario: Create exchange
- **WHEN** the host creates the 2026 exchange for a group with 5 members
- **THEN** an `open` exchange for 2026 exists with those 5 members as participants

#### Scenario: Duplicate year
- **WHEN** the host tries to create a second 2026 exchange for the same group
- **THEN** the system rejects it

### Requirement: Manage participants
While an exchange is `open`, the host SHALL be able to add group members to it or remove them from it. The host SHALL always remain a participant. Participants SHALL NOT change while an exchange is `drawn`.

#### Scenario: Member sits out a year
- **WHEN** the host removes a member from the open 2026 exchange
- **THEN** that person stays in the group but is not part of the 2026 draw

#### Scenario: Remove host
- **WHEN** the host tries to remove themselves from the participants
- **THEN** the system rejects it

#### Scenario: Locked after draw
- **WHEN** the host tries to change the participants of a `drawn` exchange
- **THEN** the system rejects the change

### Requirement: Exclusion rules
The host SHALL be able to add and delete exclusion rules on the group. A rule names two different members and SHALL apply in both directions: neither may draw the other. A pair SHALL be stored once regardless of order, and duplicates SHALL be rejected. Rules SHALL carry over to every future exchange of the group. Only the host SHALL see the rules.

#### Scenario: Add a couple rule
- **WHEN** the host adds a rule between Rosalie and Marc
- **THEN** in every later draw, Rosalie does not draw Marc and Marc does not draw Rosalie

#### Scenario: Duplicate in reverse order
- **WHEN** a rule Rosalie–Marc exists and the host adds Marc–Rosalie
- **THEN** the system rejects it as a duplicate

#### Scenario: Same person twice
- **WHEN** the host tries to add a rule between a member and themselves
- **THEN** the system rejects it

#### Scenario: Non-host cannot see rules
- **WHEN** a member who is not the host requests the group's rules
- **THEN** the system returns none

### Requirement: Rules must keep the draw possible
When the host adds a rule, the system SHALL reject it if no valid draw would exist with it. The check SHALL use the participants of the group's open exchange, or all group members if there is no open exchange.

#### Scenario: Rule makes the draw impossible
- **WHEN** participants are A, B and C, rule A–B exists, and the host adds rule A–C
- **THEN** the system rejects the rule with "no draw would be possible with this rule"

### Requirement: Rules locked while drawn
While the group's most recent exchange is `drawn`, the system SHALL reject adding or deleting rules.

#### Scenario: Edit rules after draw
- **WHEN** the latest exchange is `drawn` and the host tries to add a rule
- **THEN** the system rejects it and tells the host to reset the draw or create next year's exchange first

### Requirement: Status changes only through draw actions
An exchange's status SHALL change only through the draw and reset actions, never through a direct edit.

#### Scenario: Direct status edit
- **WHEN** anyone attempts to set an exchange's status directly through the API
- **THEN** the system rejects it
