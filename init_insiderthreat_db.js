// InsiderThreatDB Initialization Script
// Run this script on Ubuntu MongoDB to create database and collections

// Switch to InsiderThreatDB
db = db.getSiblingDB('InsiderThreatDB');

print("🔧 Creating InsiderThreatDB database...");

// Drop existing collections if needed (optional - comment out for safety)
// db.Logs.drop();
// db.Devices.drop();

// ==========================================
// Create Logs Collection with Schema Validation
// ==========================================
print("📝 Creating Logs collection...");

db.createCollection("Logs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["LogType", "Severity", "Message", "Timestamp"],
      properties: {
        LogType: {
          bsonType: "string",
          description: "Type of log: USB_INSERT, FACE_FAIL, VPN_DETECT, etc."
        },
        Severity: {
          bsonType: "string",
          enum: ["Info", "Warning", "Critical"],
          description: "Severity level"
        },
        Message: {
          bsonType: "string",
          description: "Log message content"
        },
        ComputerName: {
          bsonType: "string",
          description: "Name of the client computer"
        },
        IPAddress: {
          bsonType: "string",
          description: "IP address of the client"
        },
        ActionTaken: {
          bsonType: "string",
          enum: ["None", "Blocked", "Allowed", "Reported"],
          description: "Action taken by the system"
        },
        DeviceId: {
          bsonType: ["string", "null"],
          description: "USB Device ID (VID/PID/Serial)"
        },
        DeviceName: {
          bsonType: ["string", "null"],
          description: "Friendly name of the USB device"
        },
        Timestamp: {
          bsonType: "date",
          description: "When the log was created"
        }
      }
    }
  }
});

print("✅ Logs collection created");

// ==========================================
// Create Devices Collection (Whitelist)
// ==========================================
print("🔌 Creating Devices collection...");

db.createCollection("Devices", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["Name", "DeviceId", "IsAllowed"],
      properties: {
        Name: {
          bsonType: "string",
          description: "Device friendly name"
        },
        DeviceId: {
          bsonType: "string",
          description: "Full USB Device ID"
        },
        IsAllowed: {
          bsonType: "bool",
          description: "Whether device is whitelisted"
        },
        Description: {
          bsonType: ["string", "null"],
          description: "Additional notes about the device"
        },
        CreatedAt: {
          bsonType: "date",
          description: "When device was added to whitelist"
        }
      }
    }
  }
});

print("✅ Devices collection created");

// ==========================================
// Create Indexes for Performance
// ==========================================
print("⚡ Creating indexes...");

// Logs indexes
db.Logs.createIndex({ "Timestamp": -1 });  // Sort by newest first
db.Logs.createIndex({ "LogType": 1, "Severity": 1 });  // Filter by type and severity
db.Logs.createIndex({ "DeviceId": 1 });  // Find logs by device
db.Logs.createIndex({ "ComputerName": 1 });  // Find logs by computer

// Devices indexes
db.Devices.createIndex({ "DeviceId": 1 }, { unique: true });  // Prevent duplicate devices
db.Devices.createIndex({ "IsAllowed": 1 });  // Filter by allowed status

print("✅ Indexes created");

// ==========================================
// Insert Sample Data (Optional)
// ==========================================
print("📊 Inserting sample data...");

db.Logs.insertOne({
  LogType: "SYSTEM",
  Severity: "Info",
  Message: "InsiderThreat System Initialized",
  ComputerName: "UBUNTU-SERVER",
  IPAddress: "192.168.192.129",
  ActionTaken: "None",
  DeviceId: null,
  DeviceName: null,
  Timestamp: new Date()
});

print("✅ Sample log inserted");

// ==========================================
// Verify Setup
// ==========================================
print("\n📋 Database Setup Summary:");
print("===================================");
print("Database: InsiderThreatDB");
print("\nCollections:");
db.getCollectionNames().forEach(function (col) {
  print("  - " + col);
});

print("\nLogs Collection Document Count: " + db.Logs.countDocuments({}));
print("Devices Collection Document Count: " + db.Devices.countDocuments({}));

print("\n✅ InsiderThreatDB initialization complete!");
print("\nConnection String for Compass:");
print("mongodb://admin:admin123@192.168.203.142:27017/?authSource=admin");
