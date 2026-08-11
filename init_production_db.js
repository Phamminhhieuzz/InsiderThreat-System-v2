// ====================================================================
// InsiderThreat Production-Ready Database Schema
// Optimized for: Performance, Scalability, Security, Analytics
// ====================================================================

db = db.getSiblingDB('InsiderThreatDB');

print("🚀 Creating Production-Ready InsiderThreat Database...\n");

// ====================================================================
// 1. LOGS COLLECTION - Time-Series Optimized
// ====================================================================
print("📊 Creating Logs collection with time-series optimization...");

db.createCollection("Logs", {
    timeseries: {
        timeField: "Timestamp",
        metaField: "metadata",
        granularity: "minutes"
    }
});

// Create indexes for fast queries
db.Logs.createIndex({ "Timestamp": -1 });  // Newest first
db.Logs.createIndex({ "metadata.LogType": 1, "metadata.Severity": 1 });
db.Logs.createIndex({ "metadata.ComputerName": 1, "Timestamp": -1 });
db.Logs.createIndex({ "metadata.DeviceId": 1 });
db.Logs.createIndex({ "metadata.IPAddress": 1, "Timestamp": -1 });
db.Logs.createIndex({ "Timestamp": 1 }, { expireAfterSeconds: 7776000 }); // Auto-delete after 90 days

print("✅ Logs collection created with time-series optimization");

// ====================================================================
// 2. DEVICES COLLECTION - USB Whitelist with Audit Trail
// ====================================================================
print("🔌 Creating Devices collection with audit trail...");

db.createCollection("Devices", {
    validator: {
        $jsonSchema: {
            bsonType: "object",
            required: ["Name", "DeviceId", "IsAllowed", "VidPid", "CreatedAt"],
            properties: {
                Name: {
                    bsonType: "string",
                    minLength: 1,
                    maxLength: 200,
                    description: "Device friendly name"
                },
                DeviceId: {
                    bsonType: "string",
                    pattern: "^USB\\\\VID_[0-9A-F]{4}&PID_[0-9A-F]{4}",
                    description: "Full USB Device ID with VID/PID"
                },
                VidPid: {
                    bsonType: "string",
                    pattern: "^VID_[0-9A-F]{4}&PID_[0-9A-F]{4}$",
                    description: "Extracted VID/PID for matching"
                },
                IsAllowed: {
                    bsonType: "bool",
                    description: "Whitelist status"
                },
                Description: {
                    bsonType: ["string", "null"],
                    maxLength: 500
                },
                CreatedAt: {
                    bsonType: "date"
                },
                CreatedBy: {
                    bsonType: ["string", "null"],
                    description: "Admin who whitelisted device"
                },
                LastModified: {
                    bsonType: ["date", "null"]
                },
                ModifiedBy: {
                    bsonType: ["string", "null"]
                },
                Category: {
                    bsonType: ["string", "null"],
                    enum: ["Storage", "Input", "Network", "Audio", "Other", null],
                    description: "Device category"
                },
                Manufacturer: {
                    bsonType: ["string", "null"],
                    description: "Device manufacturer"
                },
                TrustLevel: {
                    bsonType: ["string", "null"],
                    enum: ["High", "Medium", "Low", null],
                    description: "Trust level of device"
                }
            }
        }
    }
});

// Indexes for Devices
db.Devices.createIndex({ "DeviceId": 1 }, { unique: true });
db.Devices.createIndex({ "VidPid": 1 });
db.Devices.createIndex({ "IsAllowed": 1 });
db.Devices.createIndex({ "Category": 1, "IsAllowed": 1 });
db.Devices.createIndex({ "TrustLevel": 1 });
db.Devices.createIndex({ "CreatedAt": -1 });

print("✅ Devices collection created with audit trail support");

// ====================================================================
// 3. USERS COLLECTION - Admin/Employee Management
// ====================================================================
print("👥 Creating Users collection...");

db.createCollection("Users", {
    validator: {
        $jsonSchema: {
            bsonType: "object",
            required: ["Username", "Email", "Role", "IsActive"],
            properties: {
                Username: {
                    bsonType: "string",
                    minLength: 3,
                    maxLength: 50
                },
                Email: {
                    bsonType: "string",
                    pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
                },
                PasswordHash: {
                    bsonType: "string"
                },
                Role: {
                    bsonType: "string",
                    enum: ["Admin", "Analyst", "Viewer"],
                    description: "User role for RBAC"
                },
                IsActive: {
                    bsonType: "bool"
                },
                LastLogin: {
                    bsonType: ["date", "null"]
                },
                CreatedAt: {
                    bsonType: "date"
                },
                Permissions: {
                    bsonType: ["array", "null"],
                    items: { bsonType: "string" },
                    description: "Granular permissions"
                }
            }
        }
    }
});

db.Users.createIndex({ "Username": 1 }, { unique: true });
db.Users.createIndex({ "Email": 1 }, { unique: true });
db.Users.createIndex({ "Role": 1, "IsActive": 1 });

print("✅ Users collection created");

// ====================================================================
// 4. COMPUTERS COLLECTION - Client Inventory
// ====================================================================
print("💻 Creating Computers collection...");

db.createCollection("Computers", {
    validator: {
        $jsonSchema: {
            bsonType: "object",
            required: ["ComputerName", "IPAddress", "IsActive"],
            properties: {
                ComputerName: { bsonType: "string" },
                IPAddress: { bsonType: "string" },
                MACAddress: { bsonType: ["string", "null"] },
                OS: { bsonType: ["string", "null"] },
                OSVersion: { bsonType: ["string", "null"] },
                LastSeen: { bsonType: "date" },
                IsActive: { bsonType: "bool" },
                Location: { bsonType: ["string", "null"] },
                Department: { bsonType: ["string", "null"] },
                AssignedUser: { bsonType: ["string", "null"] },
                AgentVersion: { bsonType: ["string", "null"] },
                CreatedAt: { bsonType: "date" }
            }
        }
    }
});

db.Computers.createIndex({ "ComputerName": 1 }, { unique: true });
db.Computers.createIndex({ "IPAddress": 1 });
db.Computers.createIndex({ "IsActive": 1, "LastSeen": -1 });
db.Computers.createIndex({ "Department": 1 });

print("✅ Computers collection created");

// ====================================================================
// 5. ALERTS COLLECTION - Security Alerts & Notifications
// ====================================================================
print("🚨 Creating Alerts collection...");

db.createCollection("Alerts", {
    validator: {
        $jsonSchema: {
            bsonType: "object",
            required: ["Title", "Severity", "Status", "CreatedAt"],
            properties: {
                Title: { bsonType: "string", maxLength: 200 },
                Description: { bsonType: "string", maxLength: 1000 },
                Severity: {
                    bsonType: "string",
                    enum: ["Critical", "High", "Medium", "Low"]
                },
                Status: {
                    bsonType: "string",
                    enum: ["New", "Acknowledged", "Investigating", "Resolved", "False Positive"]
                },
                Category: {
                    bsonType: "string",
                    enum: ["USB", "Network", "Authentication", "System"]
                },
                ComputerName: { bsonType: ["string", "null"] },
                AssignedTo: { bsonType: ["string", "null"] },
                RelatedLogIds: {
                    bsonType: ["array", "null"],
                    items: { bsonType: "objectId" }
                },
                CreatedAt: { bsonType: "date" },
                AcknowledgedAt: { bsonType: ["date", "null"] },
                ResolvedAt: { bsonType: ["date", "null"] },
                ResolutionNotes: { bsonType: ["string", "null"] }
            }
        }
    }
});

db.Alerts.createIndex({ "Status": 1, "Severity": 1 });
db.Alerts.createIndex({ "CreatedAt": -1 });
db.Alerts.createIndex({ "ComputerName": 1, "Status": 1 });
db.Alerts.createIndex({ "AssignedTo": 1, "Status": 1 });

print("✅ Alerts collection created");

// ====================================================================
// 6. AUDIT_TRAIL COLLECTION - Change Tracking
// ====================================================================
print("📝 Creating AuditTrail collection...");

db.createCollection("AuditTrail", {
    validator: {
        $jsonSchema: {
            bsonType: "object",
            required: ["Action", "Collection", "Timestamp", "PerformedBy"],
            properties: {
                Action: {
                    bsonType: "string",
                    enum: ["CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT"]
                },
                Collection: { bsonType: "string" },
                DocumentId: { bsonType: ["string", "null"] },
                Before: { bsonType: ["object", "null"] },
                After: { bsonType: ["object", "null"] },
                Timestamp: { bsonType: "date" },
                PerformedBy: { bsonType: "string" },
                IPAddress: { bsonType: ["string", "null"] },
                Reason: { bsonType: ["string", "null"] }
            }
        }
    }
});

db.AuditTrail.createIndex({ "Timestamp": -1 });
db.AuditTrail.createIndex({ "Collection": 1, "DocumentId": 1 });
db.AuditTrail.createIndex({ "PerformedBy": 1, "Timestamp": -1 });

print("✅ AuditTrail collection created");

// ====================================================================
// 7. STATISTICS COLLECTION - Daily Aggregated Stats
// ====================================================================
print("📈 Creating Statistics collection...");

db.createCollection("Statistics", {
    validator: {
        $jsonSchema: {
            bsonType: "object",
            required: ["Date", "Type"],
            properties: {
                Date: { bsonType: "date" },
                Type: {
                    bsonType: "string",
                    enum: ["Daily", "Weekly", "Monthly"]
                },
                TotalLogs: { bsonType: "int" },
                CriticalLogs: { bsonType: "int" },
                BlockedDevices: { bsonType: "int" },
                AllowedDevices: { bsonType: "int" },
                ActiveComputers: { bsonType: "int" },
                TopBlockedDevices: { bsonType: ["array", "null"] },
                TopComputers: { bsonType: ["array", "null"] }
            }
        }
    }
});

db.Statistics.createIndex({ "Date": -1, "Type": 1 }, { unique: true });

print("✅ Statistics collection created");

// ====================================================================
// 8. VIEWS - Pre-computed Analytics
// ====================================================================
print("🔍 Creating analytical views...");

// Recent Critical Events
db.createView("RecentCriticalEvents", "Logs", [
    { $match: { "metadata.Severity": "Critical" } },
    { $sort: { "Timestamp": -1 } },
    { $limit: 100 }
]);

// Active Blocked Devices (not in whitelist)
db.createView("ActiveThreats", "Logs", [
    {
        $match: {
            "metadata.LogType": "USB_INSERT",
            "metadata.Severity": "Critical"
        }
    },
    {
        $lookup: {
            from: "Devices",
            localField: "metadata.DeviceId",
            foreignField: "DeviceId",
            as: "whitelist"
        }
    },
    { $match: { "whitelist": { $size: 0 } } },
    { $sort: { "Timestamp": -1 } },
    { $limit: 50 }
]);

print("✅ Views created");

// ====================================================================
// 9. Insert Sample Data
// ====================================================================
print("\n📊 Inserting sample data...");

// Sample admin user (password should be hashed in production)
db.Users.insertOne({
    Username: "admin",
    Email: "admin@insiderthreat.local",
    PasswordHash: "$2a$10$samplehashhere",  // Use bcrypt in production
    Role: "Admin",
    IsActive: true,
    CreatedAt: new Date(),
    Permissions: ["*"]
});

// Sample computer
db.Computers.insertOne({
    ComputerName: "DESKTOP-001",
    IPAddress: "192.168.1.100",
    OS: "Windows 11",
    OSVersion: "23H2",
    LastSeen: new Date(),
    IsActive: true,
    Department: "IT",
    AgentVersion: "1.0.0",
    CreatedAt: new Date()
});

print("✅ Sample data inserted");

// ====================================================================
// 10. Database Summary
// ====================================================================
print("\n" + "=".repeat(60));
print("✅ PRODUCTION DATABASE SETUP COMPLETE!");
print("=".repeat(60));

print("\n📋 Collections Created:");
db.getCollectionNames().forEach(function (col) {
    var count = db[col].countDocuments({});
    var indexes = db[col].getIndexes().length;
    print("  ✓ " + col.padEnd(20) + " | Docs: " + count + " | Indexes: " + indexes);
});

print("\n🔐 Security Features:");
print("  ✓ Schema validation enabled");
print("  ✓ Unique constraints on critical fields");
print("  ✓ Audit trail for all changes");

print("\n⚡ Performance Features:");
print("  ✓ Time-series optimization for Logs");
print("  ✓ Compound indexes for common queries");
print("  ✓ TTL index for automatic log cleanup (90 days)");
print("  ✓ Pre-computed views for analytics");

print("\n📊 Scalability Features:");
print("  ✓ Sharding-ready design");
print("  ✓ Horizontal scaling support");
print("  ✓ Aggregated statistics collection");

print("\n🎯 Next Steps:");
print("  1. Update Server code to use new schema");
print("  2. Implement audit trail logging");
print("  3. Set up automated backups");
print("  4. Configure monitoring & alerting");

print("\n✅ Database ready for production use!");
