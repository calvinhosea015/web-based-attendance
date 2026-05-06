# Web-Based Attendance with Geolocation

A simple office attendance system using browser geolocation and Node.js.

## Features

- Check in from the browser using GPS coordinates
- Office geofence validation against a fixed office location
- Attendance record storage in `attendance.json`
- Admin page to review recent records
- Export attendance as Excel-friendly CSV from the admin page

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open the app in your browser:
   - Landing page: `http://localhost:3000`
   - Login page: `http://localhost:3000/login.html`

## Accounts

- Admin: `admin` / `admin123`
- User: `user` / `user123`

## Customize office location

Update the `OFFICES` list in `server.js` to add or change selectable office locations. The check-in page automatically loads available offices from the backend.

## Notes

- The app uses browser geolocation, so the user must allow location access.
- Attendance records are saved to `attendance.json` and should be protected in a production environment.
