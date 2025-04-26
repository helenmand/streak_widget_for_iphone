// ===========================================
// USER CONFIGURATION SECTION
// ===========================================

// Step 1: Set the activity type you're tracking (options: "READING", "MEDITATION", "SPORTS")
const ACTIVITY_NAME = "READING"; // customize this per widget
const STORAGE_FILE = `${ACTIVITY_NAME.toLowerCase()}_activity_progress.json`;

// STEP 2: Set your custom start date
// Format: YYYY, MM-1, DD (Months are 0-indexed, January=0, December=11)
// Example: April 10, 2025 would be (2025, 3, 10)
// Note: Month is zero-based (January = 0)
const START_DATE = new Date(2025, 3, 10); // April 10, 2025

// Step 3: Configure widget appearance
const BG_COLOR = "#2c2c2e";       // Widget background color
const BG_OVERLAY_OPACITY = 1;     // Background opacity (0-1)
// Color settings for dots
const COLOR_FILLED = new Color("#ffffff");         // Color for completed days
const COLOR_UNFILLED = new Color("#ff0000");       // Color for missed days
const COLOR_FUTURE = new Color("#888888");         // Color for future days

// STEP 4: Layout and sizing settings
// Note: These are working well for Iphone 12 mini -- you might need to change these
const PADDING = 12;          // Space around the edges of the widget
const CIRCLE_SIZE = 5;       // Size of the progress dots
const CIRCLE_SPACING = 3;    // Space between dots
const TEXT_SPACING = 8;      // Space between dot grid and text
const DOT_SHIFT_LEFT = 2;    // Adjust horizontal alignment
const YEAR_OFFSET = DOT_SHIFT_LEFT - 2;
const STREAK_OFFSET = 0;

// ===========================================
// CALCULATIONS AND CONSTANTS
// ===========================================

// Calculate days remaining in the year from start date
function calculateDaysToTrack(startDate) {
  const year = startDate.getFullYear();
  const lastDayOfYear = new Date(year, 11, 31); // December 31st
  
  // Calculate the difference in days
  const diffTime = lastDayOfYear.getTime() - startDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include the start date
  
  return diffDays;
}

// Dynamically calculate days to track based on start date
const DAYS_TO_TRACK = calculateDaysToTrack(START_DATE);

// Set widget dimensions and layout calculations
const WIDGET_WIDTH = 320;
const AVAILABLE_WIDTH = WIDGET_WIDTH - (2 * PADDING);
const TOTAL_CIRCLE_WIDTH = CIRCLE_SIZE + CIRCLE_SPACING;
const COLUMNS = Math.floor(AVAILABLE_WIDTH / TOTAL_CIRCLE_WIDTH);

// Font settings
const MENLO_REGULAR = new Font("Menlo", 12);
const MENLO_BOLD = new Font("Menlo-Bold", 12);

// ===========================================
// MAIN SCRIPT EXECUTION
// ===========================================

// File management setup
let fm = FileManager.iCloud();
let dir = fm.documentsDirectory();
// Dynamically create the path for the activity-specific JSON file
let path = fm.joinPath(dir, STORAGE_FILE);

// Make sure the data file exists (create if missing)
await ensureFile();

// Load existing data, or initialize
let data = JSON.parse(fm.readString(path) || "{}");
if (!data[ACTIVITY_NAME]) data[ACTIVITY_NAME] = {};

let today = getTodayKey();
let isInWidget = config.runsInWidget;

// Are we running inside the widget or manually in the app?
if (!isInWidget) {
  // =============== Manual Run: Update today's activity ===============
  // Check if today's activity is already marked as completed
  if (data[ACTIVITY_NAME][today] && data[ACTIVITY_NAME][today].completed) {
    // Already logged today — offer to add more
    let currentValue = data[ACTIVITY_NAME][today].details.value;
    let currentUnit = data[ACTIVITY_NAME][today].details.unit;
    let totalValue = calculateTotalValue(data[ACTIVITY_NAME]); 
    let totalUnit = currentUnit; // pages, minutes, etc.

    let confirm = await askAddMore(ACTIVITY_NAME, currentValue, currentUnit, totalValue, totalUnit);
    if (confirm) {
      // Ask user for additional input to track progress
      let additionalData = await getActivityDetailsToAdd(ACTIVITY_NAME, currentValue, currentUnit);
      let updatedValue = currentValue + additionalData.value;

      // Update the data
      data[ACTIVITY_NAME][today].details.value = updatedValue;

      fm.writeString(path, JSON.stringify(data));
      console.log(`✅ Updated ${ACTIVITY_NAME} for ${today} with new total: ${updatedValue} ${currentUnit}`);

      // Refresh the widget immediately to show the updated value
      let widget = await createWidget(data[ACTIVITY_NAME], ACTIVITY_NAME);
      Script.setWidget(widget);
    } else {
      console.log("❌ Not adding more today.");
    }
  } else {
    // No record yet for today — ask if user completed the activity
    let confirm = await askActivityCompleted(ACTIVITY_NAME);
    if (confirm) {
      // If activity is confirmed, ask for progress data based on activity type
      let activityData = await getActivityDetails(ACTIVITY_NAME);

      // Save both completion status and activity details
      data[ACTIVITY_NAME][today] = {
        completed: true,
        details: activityData
      };

      fm.writeString(path, JSON.stringify(data));
      console.log(`✅ Marked ${ACTIVITY_NAME} as completed for ${today} with details: ${JSON.stringify(activityData)}`);

      // Refresh the widget immediately to show the updated dot
      let widget = await createWidget(data[ACTIVITY_NAME], ACTIVITY_NAME);
      Script.setWidget(widget);
    } else {
      console.log("❌ Not completed today.");
    }
  }
} else {
  // =============== Widget Run: Just display the widget ===============
  let widget = await createWidget(data[ACTIVITY_NAME], ACTIVITY_NAME);
  Script.setWidget(widget);
}

Script.complete();

// ===========================================
// FUNCTIONS
// ===========================================

/**
 * Ask user if they completed today's activity
 */
async function askActivityCompleted(activityName) {
  let alert = new Alert();
  alert.title = `Activity: ${activityName}`;
  alert.message = `Did you complete the task today?`;
  alert.addAction("✅");
  alert.addCancelAction("❌");
  let result = await alert.present();
  return result === 0;
}

/**
 * Ask user if they want to add more pages/minutes to today's record
 */
async function getActivityDetailsToAdd(activityName, currentValue, currentUnit, totalValue, totalUnit) {
  let alert = new Alert();
  
  // Prepare the input prompt based on activity type
  if (activityName === "READING") {
    alert.title = "Add Pages";
    alert.message = `You have already read ${currentValue} pages today. How many more pages would you like to add?`;
    alert.addTextField("Pages to add", "");
  } else if (activityName === "MEDITATION" || activityName === "SPORTS") {
    alert.title = "Add Duration";
    alert.message = `You have already spent ${currentValue} ${currentUnit} today. How many more ${currentUnit} would you like to add?`;
    alert.addTextField("Minutes to add", "");
  }
  
  alert.addAction("Save");
  alert.addCancelAction("Cancel");

  let result = await alert.present();
  
  if (result === -1) {
    // User canceled, return 0 value for no addition
    return { value: 0, unit: currentUnit };
  }
  
  let textValue = alert.textFieldValue(0);
  let numValue = parseInt(textValue) || 0;
  
  return {
    value: numValue,
    unit: currentUnit
  };
}

/**
 * Calculate total value completed across all days
 */
function calculateTotalValue(activityData) {
  let totalValue = 0;

  // Log the activityData object to inspect its structure
  console.log("Activity Data:", activityData);

  // Loop through all days and sum up the value for completed days
  for (let key in activityData) {
    // Log the individual key (date) and its data
    console.log(`Checking activity for date: ${key}`, activityData[key]);
    
    // Check if the activity is completed
    if (activityData[key].completed) {
      // Log the value being added to total
      console.log(`Adding ${activityData[key].details.value} to total`);
      totalValue += activityData[key].details.value;
    }
  }

  // Final total value debug log
  console.log("Total Value Calculated:", totalValue);

  return totalValue;
}

/**
 * Handles updating today's activity entry if the user has already completed it.
 */
async function handleTaskCompletion(data, today, ACTIVITY_NAME, STORAGE_FILE, fm) {
  let currentValue = data[ACTIVITY_NAME][today].details.value;
  let currentUnit = data[ACTIVITY_NAME][today].details.unit;

  // Now calculate the total value correctly by summing all completed days
  let totalValue = calculateTotalValue(data[ACTIVITY_NAME]);
  let totalUnit = currentUnit;  // The unit will be the same for all days (pages, minutes, etc.)

  // Ask if the user wants to add more
  let addMore = await askAddMore(ACTIVITY_NAME, currentValue, currentUnit, totalValue, totalUnit);

  if (addMore) {
    // If user wants to add more, ask for the additional amount
    let additionalData = await getActivityDetailsToAdd(ACTIVITY_NAME, currentValue, currentUnit, totalValue, totalUnit);
    let updatedValue = currentValue + additionalData.value;

    // Update the data with the new value
    data[ACTIVITY_NAME][today].details.value = updatedValue;

    fm.writeString(STORAGE_FILE, JSON.stringify(data));
    console.log(`✅ Updated ${ACTIVITY_NAME} for ${today} with new total: ${updatedValue} ${currentUnit}`);

    // Refresh the widget immediately
    let widget = await createWidget(data[ACTIVITY_NAME], ACTIVITY_NAME);
    Script.setWidget(widget);
  } else {
    console.log("❌ Not adding more today.");
  }
}

/**
 * Prompt user whether they want to add more to today's activity
 */
async function askAddMore(activityName, currentValue, currentUnit, totalValue, totalUnit) {
  let alert = new Alert();
  
  // Customize message based on activity type
  let message = '';
  if (activityName === "READING") {
    message = `You have read a total of ${totalValue} pages.\nToday you read ${currentValue} pages.\n\nDo you want to add more?`;
  } else if (activityName === "MEDITATION" || activityName === "SPORTS") {
    message = `You have spent a total of ${totalValue} ${totalUnit}.\nToday you spent ${currentValue} ${currentUnit}.\n\nDo you want to add more?`;
  }
  
  alert.title = `Activity: ${activityName}`;
  alert.message = message;

  alert.addAction("✅");
  alert.addCancelAction("❌");

  let result = await alert.present();
  return result === 0; // If 'Yes' is selected, return true
}

/**
 * Get today's date in 'YYYY-MM-DD' format
 */
function getTodayKey() {
  let d = new Date();
  return d.toISOString().slice(0, 10);
}

/**
 * Format any Date object into 'YYYY-MM-DD'
 */
function getDateKey(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Collect details (pages/minutes) when logging a new activity
 */
async function getActivityDetails(activityName) {
  let alert = new Alert();
  
  if (activityName === "READING") {
    alert.title = "Pages Read";
    alert.message = "How many pages did you read today?";
    alert.addTextField("Number of pages", "");
  } else if (activityName === "MEDITATION" || activityName === "SPORTS") {
    alert.title = "Duration";
    alert.message = `How many minutes did you spend on ${activityName.toLowerCase()} today?`;
    alert.addTextField("Minutes", "");
  }
  
  alert.addAction("Save");
  alert.addCancelAction("Cancel");
  
  let result = await alert.present();
  
  if (result === -1) {
    // User canceled, provide default value
    return { value: 0, unit: activityName === "READING" ? "pages" : "minutes" };
  }
  
  let textValue = alert.textFieldValue(0);
  let numValue = parseInt(textValue) || 0;
  
  return {
    value: numValue,
    unit: activityName === "READING" ? "pages" : "minutes"
  };
}

/**
 * Create a blank data file if it doesn't already exist
 */
async function ensureFile() {
  if (!fm.fileExists(path)) {
    fm.writeString(path, "{}");
  }
}

/**
 * Build the widget layout and fill it with data
 */
async function createWidget(activityData, activityName) {
  const widget = new ListWidget();
  
  // Set background color
  const overlay = new LinearGradient();
  overlay.locations = [0, 1];
  overlay.colors = [
    new Color(BG_COLOR, BG_OVERLAY_OPACITY),
    new Color(BG_COLOR, BG_OVERLAY_OPACITY)
  ];
  widget.backgroundGradient = overlay;
  
  widget.setPadding(12, PADDING, 12, PADDING);

  // Create main grid container
  const gridContainer = widget.addStack();
  gridContainer.layoutVertically();

  const gridStack = gridContainer.addStack();
  gridStack.layoutVertically();
  gridStack.spacing = CIRCLE_SPACING;

  // Add colored dots in the same way as the countdown widget
  generateDots(activityData, gridStack);

  widget.addSpacer(TEXT_SPACING);

  // Add footer with activity name and streak - matching the layout of the countdown widget
  const footer = widget.addStack();
  footer.layoutHorizontally();

  const activityStack = footer.addStack();
  activityStack.addSpacer(YEAR_OFFSET);
  const activityText = activityStack.addText(activityName);
  activityText.font = MENLO_BOLD;
  activityText.textColor = COLOR_FILLED;

  // Calculate streak (no activity details shown)
  let streak = calcStreak(activityData);
  
  // Use different suffix based on streak count
  let suffix = streak === 1 ? "day streak" : "days streak";
  const streakText = `${streak} ${suffix}`;
  
  const textWidth = streakText.length * 7.5;
  const availableSpace = WIDGET_WIDTH - (PADDING * 2) - YEAR_OFFSET - (activityText.text.length * 7.5);
  const spacerLength = availableSpace - textWidth + STREAK_OFFSET;

  footer.addSpacer(spacerLength);

  const streakTextStack = footer.addStack();
  const streakDisplay = streakTextStack.addText(streakText);
  streakDisplay.font = MENLO_REGULAR;
  streakDisplay.textColor = new Color("#999999");

  return widget;
}

/**
 * Generate the grid of activity dots (completed/missed/future)
 */
function generateDots(activityData, gridStack) {
  const todayKey = getTodayKey(); // Get today's key (YYYY-MM-DD)
  const ROWS = Math.ceil(DAYS_TO_TRACK / COLUMNS); // Calculate number of rows needed

  for (let row = 0; row < ROWS; row++) {
    const rowStack = gridStack.addStack();
    rowStack.layoutHorizontally();
    rowStack.addSpacer(DOT_SHIFT_LEFT); // Add left spacer for alignment
    
    for (let col = 0; col < COLUMNS; col++) {
      const day = row * COLUMNS + col; // Calculate the day index based on row and column
      if (day >= DAYS_TO_TRACK) continue; // If the day exceeds the total number of days to track, skip it

      // Create date for this dot based on START_DATE + number of days
      let date = new Date(START_DATE);
      date.setDate(date.getDate() + day); // Add the 'day' number of days to the start date
      let key = getDateKey(date); // Get the date key in YYYY-MM-DD format

      // Skip dots for dates before START_DATE (2025-04-10 in this case)
      if (new Date(key) < new Date(START_DATE)) continue; // Skip any date before START_DATE

      const circle = rowStack.addText("●"); // Add a circle for the dot
      circle.font = Font.systemFont(CIRCLE_SIZE); // Set the font size for the dot

      // Compare date keys to determine if it's in the future, completed, or unfilled
      if (key > todayKey) {
        circle.textColor = COLOR_FUTURE; // Future dates are gray
      } else {
        // Check if the task is completed or not
        if (activityData[key] && activityData[key].completed) {
          circle.textColor = COLOR_FILLED; // Completed tasks are white
        } else {
          circle.textColor = COLOR_UNFILLED; // Incomplete tasks are red
        }
      }

      // Add spacer between dots, unless it's the last dot in the row
      if (col < COLUMNS - 1) rowStack.addSpacer(CIRCLE_SPACING);
    }
  }
}

/**
 * Calculate the current activity streak (consecutive completed days)
 */
function calcStreak(activityData) {
  let streak = 0;
  let d = new Date();
  
  while (true) {
    const dateKey = getDateKey(d);
    if (activityData[dateKey] && activityData[dateKey].completed) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  
  return streak;
}