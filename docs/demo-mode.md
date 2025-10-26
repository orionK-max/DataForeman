# Demo Mode

**Status:** Production Ready  
**Version:** 2.0  
**Last Updated:** October 26, 2025

## Overview

Demo Mode enables DataForeman to serve as a public demonstration platform by automatically creating **unique temporary accounts** for each visitor. This allows potential users to explore the system's capabilities without requiring administrator intervention or risking data conflicts between concurrent users.

### Key Features

- **Unique User per Visitor**: Each visitor gets their own isolated demo account (e.g., `demo_A1B2C3D4@demo.local`)
- **Granular Permissions**: Demo users can create and manage their own dashboards and charts, but have read-only access to connections
- **Auto-Cleanup**: Inactive demo users and all their created content are automatically deleted after a configurable period
- **Zero Configuration**: Just enable DEMO_MODE=1 and the system handles everything
- **Secure by Default**: Random strong passwords, isolated permissions, automatic cleanup

### Demo User Capabilities

| Feature | Permission | Description |
|---------|-----------|-------------|
| Dashboards | Full CRUD | Can create, read, update, and delete their own dashboards |
| Charts | Full CRUD | Can create and manage their own chart compositions |
| Connections/Devices | Read Only | Can view existing connections but not modify them |
| Tags | Read Only | Can view tags but not add/modify/delete |
| Poll Groups | Read Only | Can view polling configurations but not modify |
| Units | Read Only | Can view measurement units but not modify |
| System Diagnostics | Read Only | Can view system health and capacity information |
| Logs | No Access | Cannot access system logs |
| User Management | No Access | Cannot manage users or permissions |

## Configuration

### Environment Variables

Add to your `.env` file or set in your deployment environment:

```bash
# Enable demo mode
DEMO_MODE=1

# Minutes of inactivity before user cleanup (default: 60)
DEMO_INACTIVE_MINUTES=60

# Prefix for generated passwords (default: Demo)
DEMO_PASSWORD_PREFIX=Demo
```

### Docker Compose

The `docker-compose.yml` includes demo mode configuration:

```yaml
services:
  core:
    environment:
      DEMO_MODE: ${DEMO_MODE:-0}
      DEMO_INACTIVE_MINUTES: ${DEMO_INACTIVE_MINUTES:-60}
      DEMO_PASSWORD_PREFIX: ${DEMO_PASSWORD_PREFIX:-Demo}
```

## How It Works

### User Creation Flow

1. Visitor accesses the login page
2. Login page detects demo mode is enabled (via `/api/auth/demo-info`)
3. Visitor clicks "Create Demo Account" button
4. Frontend calls `POST /api/auth/demo-credentials`
5. Backend generates:
   - **Username**: `demo_XXXXXXXX` (8 random hex characters)
   - **Email**: `demo_XXXXXXXX@demo.local`
   - **Password**: `Demo` + 8 random alphanumeric characters (e.g., `DemoAb3Np9Qr`)
   - **Display Name**: `Demo User XXXXXXXX`
6. Backend creates user with:
   - Viewer role (for JWT compatibility)
   - Granular permissions for each feature
   - Initial `last_login_at` timestamp
7. Credentials are returned and auto-filled in login form
8. Visitor logs in and can start using the system

### Permission System

Demo users receive carefully curated permissions:

```javascript
{
  // Full access to create personal content
  "dashboards": { create: true, read: true, update: true, delete: true },
  "chart_composer": { create: true, read: true, update: true, delete: true },
  
  // Read-only access to connectivity features
  "connectivity.devices": { create: false, read: true, update: false, delete: false },
  "connectivity.tags": { create: false, read: true, update: false, delete: false },
  "connectivity.poll_groups": { create: false, read: true, update: false, delete: false },
  "connectivity.units": { create: false, read: true, update: false, delete: false },
  
  // Read-only access to diagnostics
  "diagnostic.system": { create: false, read: true, update: false, delete: false },
  "diagnostic.capacity": { create: false, read: true, update: false, delete: false },
  "diagnostic.network": { create: false, read: true, update: false, delete: false },
  "diagnostic.logs": { create: false, read: false, update: false, delete: false },
}
```

### Cleanup Process

Every 5 minutes, the system:

1. Queries for demo users with email matching `demo_%@demo.local`
2. Checks `last_login_at` timestamp from `auth_identities` table
3. Identifies users inactive for longer than `DEMO_INACTIVE_MINUTES`
4. For each inactive user:
   - Deletes all user-created dashboards (cascade handles dashboard_charts, dashboard_permissions)
   - Deletes all user-created chart definitions
   - Deletes user record (cascade handles auth_identities, user_roles, user_permissions, sessions)
5. Logs cleanup activity for monitoring

### Data Isolation

Each demo user's data is completely isolated:
- **Dashboards**: Only accessible by the user who created them
- **Charts**: Owned by the creating user
- **Sessions**: Tracked per-user
- **No Shared Data**: Demo users cannot see or modify each other's content

## Security Considerations

### Password Strength

- Passwords are generated with 8+ random characters
- Mix of uppercase, lowercase, and numbers (no ambiguous characters like O/0, I/l/1)
- Prefix adds memorable component (default: "Demo")
- Example: `DemoAb3Np9Qr`, `DemoXy7Zm4Kp`

### Permission Boundaries

- **Cannot modify connections**: Prevents demo users from disrupting production data collection
- **Cannot access logs**: Prevents information disclosure
- **Cannot manage users**: Prevents privilege escalation
- **Isolated dashboards**: Each user only sees their own content

### Cleanup Safety

- Uses database transactions to ensure atomic deletions
- Cascade deletes prevent orphaned records
- Logs all cleanup actions for audit trail
- Handles errors gracefully without leaving partial state

## Production Recommendations

### For Public Websites

```bash
# Enable demo mode
DEMO_MODE=1

# Shorter timeout for higher-traffic sites
DEMO_INACTIVE_MINUTES=30

# Branded password prefix (optional)
DEMO_PASSWORD_PREFIX=Try
```

### Pre-populate Demo Environment

To provide a better demo experience, pre-populate your database with:

1. **Sample Connections**: Set up 2-3 example devices (OPC UA, S7, EtherNet/IP)
2. **Sample Tags**: Configure 10-20 realistic tags with live data
3. **Sample Dashboards**: Create 1-2 public dashboards as examples

Demo users will have read-only access to these and can create their own variations.

### Monitoring

Monitor demo mode activity:

```bash
# Check demo user count
docker compose exec db psql -U postgres -d dataforeman -c \
  "SELECT COUNT(*) FROM users WHERE email LIKE 'demo_%@demo.local';"

# Check oldest demo user
docker compose exec db psql -U postgres -d dataforeman -c \
  "SELECT email, created_at FROM users WHERE email LIKE 'demo_%@demo.local' ORDER BY created_at ASC LIMIT 1;"

# View cleanup logs
docker compose logs core | grep "demo-mode"
```

### Rate Limiting

Consider adding rate limiting for the `/api/auth/demo-credentials` endpoint to prevent abuse:

```javascript
// Example with @fastify/rate-limit
await app.register(rateLimit, {
  max: 10,  // 10 requests
  timeWindow: '15 minutes',
  allowList: ['127.0.0.1'], // Allow localhost for testing
})
```

## API Reference

### GET /api/auth/demo-info

Check if demo mode is enabled.

**Request:**
```bash
curl http://localhost:3000/api/auth/demo-info
```

**Response:**
```json
{
  "enabled": true
}
```

### POST /api/auth/demo-credentials

Create a new demo user and get credentials.

**Request:**
```bash
curl -X POST http://localhost:3000/api/auth/demo-credentials
```

**Response:**
```json
{
  "username": "demo_A1B2C3D4",
  "email": "demo_A1B2C3D4@demo.local",
  "password": "DemoXy7Zm4Kp"
}
```

**Error Response:**
```json
{
  "error": "Demo mode is not enabled"
}
```

## Troubleshooting

### Demo mode not appearing on login page

**Check:**
1. Verify `DEMO_MODE=1` in environment
2. Restart core service: `docker compose restart core`
3. Check browser console for errors fetching `/api/auth/demo-info`
4. Verify JWT public endpoints include `/api/auth/demo-info` and `/api/auth/demo-credentials`

### Demo user creation fails

**Check:**
1. Core service logs: `docker compose logs core | grep demo-mode`
2. Database connection is healthy
3. Permissions exist in database: `SELECT * FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'demo_%@demo.local')`

### Cleanup not working

**Check:**
1. Verify cleanup interval is running (check logs every 5 minutes)
2. Check `last_login_at` timestamps: `SELECT email, last_login_at FROM auth_identities ai JOIN users u ON u.id = ai.user_id WHERE u.email LIKE 'demo_%@demo.local'`
3. Verify `DEMO_INACTIVE_MINUTES` is set correctly

### Too many demo users accumulating

**Possible causes:**
1. `DEMO_INACTIVE_MINUTES` set too high
2. Users actively using demo accounts
3. Cleanup interval not running

**Solution:**
```bash
# Manually clean up all inactive demo users older than 1 hour
docker compose exec db psql -U postgres -d dataforeman -c \
  "DELETE FROM users WHERE email LIKE 'demo_%@demo.local' AND created_at < NOW() - INTERVAL '1 hour';"
```

## Testing

### Manual Testing

1. Enable demo mode:
   ```bash
   echo "DEMO_MODE=1" >> .env
   docker compose restart core
   ```

2. Open login page and verify "Create Demo Account" button appears

3. Click button and verify credentials are auto-filled

4. Login and verify:
   - Can create dashboards
   - Can create charts
   - Cannot modify connections (UI should hide edit/delete buttons)
   - Cannot access user management

5. Wait for cleanup timeout and verify user is deleted

### Automated Testing

```bash
# Test demo-info endpoint
curl -s http://localhost:3000/api/auth/demo-info | jq

# Create demo user
DEMO_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/demo-credentials)
echo $DEMO_RESPONSE | jq

# Extract credentials
DEMO_EMAIL=$(echo $DEMO_RESPONSE | jq -r '.email')
DEMO_PASSWORD=$(echo $DEMO_RESPONSE | jq -r '.password')

# Test login
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASSWORD\"}" | jq

# Verify user in database
docker compose exec db psql -U postgres -d dataforeman -c \
  "SELECT id, email, display_name, is_active FROM users WHERE email = '$DEMO_EMAIL';"
```

## Migration from v1.0

If you had the previous demo mode (single shared demo user):

1. Old demo users will continue to work
2. Update environment variables:
   ```bash
   # Remove these
   -DEMO_EMAIL=demo@example.com
   -DEMO_PASSWORD=DemoPassword123
   
   # Keep these
   DEMO_MODE=1
   DEMO_INACTIVE_MINUTES=60
   
   # Add this (optional)
   DEMO_PASSWORD_PREFIX=Demo
   ```

3. Delete old demo user (will be replaced by unique users):
   ```bash
   docker compose exec db psql -U postgres -d dataforeman -c \
     "DELETE FROM users WHERE email = 'demo@example.com';"
   ```

4. Rebuild and restart:
   ```bash
   docker compose build core
   docker compose up -d core
   ```

## FAQ

**Q: Can demo users see each other's dashboards?**  
A: No. Dashboard ownership is enforced by user_id, so each demo user only sees their own dashboards.

**Q: What happens to tag data when demo user is deleted?**  
A: Demo users cannot create tags, only dashboards and charts. Tag data is unaffected.

**Q: Can I customize what demo users can do?**  
A: Yes. Edit `DEMO_PERMISSIONS` in `core/src/services/demo-mode.js` and rebuild.

**Q: Can I disable demo mode after enabling it?**  
A: Yes. Set `DEMO_MODE=0` and restart. Existing demo users will remain but no new ones will be created.

**Q: How do I clean up all demo users immediately?**  
A: 
```bash
docker compose exec db psql -U postgres -d dataforeman -c \
  "DELETE FROM users WHERE email LIKE 'demo_%@demo.local';"
```

**Q: Can demo users export data?**  
A: If your system has export functionality, demo users can export their own dashboard/chart data based on the permissions granted.

---

For questions or issues, check:
- Core service logs: `docker compose logs core | grep demo-mode`
- Database state: `SELECT * FROM users WHERE email LIKE 'demo_%@demo.local';`
- Permission system: See `docs/permission-system-developer-guide.md`
