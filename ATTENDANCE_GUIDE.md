# Vision SaaS: Geofence & Smart Attendance Guide

Vision ensures high-integrity workforce tracking through advanced geolocation verification and anomaly detection.

## 1. 📍 Geofence Technology
The system uses the **Haversine Formula** to calculate the precise "great-circle" distance between the employee's browser and the configured company office coordinates.

### **Haversine Formula**:
`d = 2R * arcsin(sqrt(sin²(Δφ/2) + cos φ₁ * cos φ₂ * sin²(Δλ/2)))`
*   *Where R is Earth's radius (6,371km), φ is latitude, and λ is longitude.*

### **Company Policies**:
*   **Strict Policy**: The system will explicitly **block** any check-in attempt if the employee is outside the `geofence_radius_meters` (e.g., 200m).
*   **Flexible Policy**: Allows the check-in but immediately attaches an **"outside_geofence" flag** to the attendance record for management review.

---

## 2. 🕵️ Anomaly & Anti-Manipulation Scanner
Vision monitors every session for suspicious patterns to prevent proxy attendance or location spoofing.

### **Key Detection Flags**:
1.  **Location Drift**: If the distance between check-in and check-out coordinates exceeds the `location_drift_threshold_km` (e.g., 5km), a drift flag is generated.
2.  **Device Fingerprint Change**: The system stores a unique ID for the device used during check-in. If the check-out comes from a different device, a **"device_changed"** alert is triggered.
3.  **Off-Hours Check-in**: Flags any session started during unusual hours (e.g., before 5 AM or after 11 PM).
4.  **Suspicious Coordinates**: Flags invalid ranges or "0,0" coordinates often associated with failed GPS signals or spoofing tools.
5.  **Short Sessions**: Sessions shorter than `min_session_minutes` (e.g., 30 mins) are flagged to prevent "punch-and-leave" behavior.

---

## 3. 🕒 Smart Checkout & Regularization

### **Auto-Checkout Service**
A background process runs every hour to close "stale" sessions.
*   **Criteria**: If a session is open past the company's `work_end_time` (+1 hour buffer) OR if the session has exceeded 14 continuous hours, the system automatically closes it and adds an `[Auto-closed]` remark.

### **Attendance Regularization**
Employees can request corrections for flagged or missed sessions.
*   **Flow**: Employee Request -> Manager Verification -> HR Approval.
*   **Impact**: Once approved, the attendance status is updated (e.g., from "Absent" to "Present"), which is automatically reflected in the next **Payroll Engine** run.
