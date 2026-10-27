## ADDED Requirements

### Requirement: Manage own wish list
Each participant of an exchange SHALL be able to add, edit and delete items on their own wish list for that exchange, whether it is `open` or `drawn`. An item SHALL have a title (required), a link (optional, must be a URL) and a note (optional).

#### Scenario: Add item
- **WHEN** a participant adds an item titled "Board game" with a link
- **THEN** the item appears on their wish list for that exchange

#### Scenario: Missing title
- **WHEN** a participant submits an item without a title
- **THEN** the system rejects it

#### Scenario: Edit after draw
- **WHEN** the exchange is `drawn` and a participant edits one of their items
- **THEN** the change is saved

#### Scenario: Non-participant
- **WHEN** a group member who is not a participant of the exchange tries to add an item to it
- **THEN** the system rejects it

### Requirement: Only the owner edits an item
Only the user who owns an item SHALL be able to edit or delete it. This includes the host.

#### Scenario: Someone else's item
- **WHEN** a participant (including the host) tries to edit another participant's item
- **THEN** the system rejects it

### Requirement: Wish list visibility
All wish lists of an exchange SHALL be visible to every participant of that exchange and to nobody else.

#### Scenario: Participant browses lists
- **WHEN** a participant opens the exchange
- **THEN** they see every participant's wish list, grouped by person

#### Scenario: Outsider
- **WHEN** a user who is not a participant requests the exchange's wish list items
- **THEN** the system returns none

### Requirement: New list every year
Wish lists SHALL belong to a single exchange. Items SHALL NOT carry over to a new exchange.

#### Scenario: Next year
- **WHEN** the host creates the 2027 exchange
- **THEN** every participant's 2027 wish list starts empty
