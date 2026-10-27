## ADDED Requirements

### Requirement: Request a login link by email
The system SHALL let a visitor request a login link by entering an email address. If a user with that email exists, the system SHALL email them a link that logs them in. If no user exists, the system SHALL respond identically and SHALL NOT send anything or create a user.

#### Scenario: Known email
- **WHEN** a visitor submits the email of an existing user
- **THEN** the system emails that address a login link and shows "check your email"

#### Scenario: Unknown email
- **WHEN** a visitor submits an email that belongs to no user
- **THEN** the system shows the same "check your email" message, sends no email, and creates no user

### Requirement: Log in with the link
Opening a valid login link and confirming SHALL authenticate the user and start a session in that browser. A link SHALL be single-use and SHALL expire after a limited time (default 15 minutes).

#### Scenario: Valid link
- **WHEN** a user opens an unexpired, unused login link and confirms
- **THEN** the user is logged in and sees their groups

#### Scenario: Expired or already-used link
- **WHEN** a user opens a login link that has expired or was already used
- **THEN** the system shows an error and offers to send a new link

#### Scenario: Link prefetched by an email scanner
- **WHEN** an automated scanner fetches the login link without user interaction
- **THEN** the link is not consumed, because login requires an explicit confirm action on the page

### Requirement: No passwords
The system SHALL NOT ask users to create or enter a password.

#### Scenario: Login page
- **WHEN** a visitor opens the login page
- **THEN** the only input is an email address

### Requirement: Log out
A logged-in user SHALL be able to log out, which ends the session in that browser.

#### Scenario: Logout
- **WHEN** a logged-in user clicks "Log out"
- **THEN** the session is cleared and the login page is shown

### Requirement: Display name
Each user SHALL have a display name, set by whoever invites them and editable by the user. Other users SHALL see display names, never email addresses.

#### Scenario: Edit own name
- **WHEN** a user changes their display name
- **THEN** the new name is shown to everyone who shares a group with them

#### Scenario: Email hidden from other users
- **WHEN** a user views a group's members
- **THEN** they see members' display names and not their email addresses
