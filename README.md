# Web-Based Attendance System

A full-stack web application for office attendance tracking with geolocation verification.

## Features

- User authentication (admin and regular users)
- Geolocation-based check-in/check-out within 200m radius of office locations
- Separate dashboards for users and admins
- Multi-language support (English and Indonesian)
- Export attendance data to Excel (admin only)
- SQLite database for data storage

## Offices

- RS Darmo: https://maps.app.goo.gl/x9nEcHGRREfzCiwC9

Admins can add new office locations by entering only the Google Maps location link.

Allowed radius for check-in: 200m

## Setup

1. Clone the repository
2. Install backend dependencies: `cd backend && npm install`
3. Install frontend dependencies: `cd frontend && npm install`
4. Start backend: `cd backend && npm start` (backend now runs on port `5001`)
5. Start frontend: `cd frontend && npm start`

## Default Admin Account

- Username: admin
- Password: admin123

## Usage

- Login with admin credentials to manage users and export data
- Login with user credentials to check-in/check-out
- Geolocation permission is required for check-in/check-out

## Technologies

- Backend: Node.js, Express, SQLite, JWT
- Frontend: React, Axios, React Router, i18next