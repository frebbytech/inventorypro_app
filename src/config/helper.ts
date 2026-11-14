export function isValidEmail(email: string) {
  // Regular expression pattern for a valid email address
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Check if the input matches the pattern
  return emailPattern.test(email);
}

export const randomNumber = () => {
  return Math.random().toString().split(".")[1];
};

export function randomCode(length = 16) {
  let result = "";
  const characters = "ABCDEF0123456789";

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return result;
}

export const hasInvalidValues = (obj: object) => {
  return Object.values(obj).some(
    (value) => value === null || value === undefined || value === ""
  );
};

export function getTableTitle(stage: string) {
  let title = "";
  let subtitle = "";

  switch (stage) {
    case "scheduled":
      title = "Appointment Confirmation List";
      subtitle =
        "View all confirmed appointments with scheduled dates and times. Ensure that each patient is notified and prepared for their visit.";
      break;

    case "rescheduled":
      title = "Rescheduled Appointments";
      subtitle =
        "Track appointments that have been rescheduled, including original and new dates. Ensure timely communication with patients about changes.";
      break;

    case "cancelled":
      title = "Cancelled Appointments";
      subtitle =
        "Monitor all appointments that have been cancelled. Follow up with patients if needed or reschedule at their convenience.";
      break;

    case "feedback":
      title = "Feedback Pending Appointments";
      subtitle =
        "Check appointments where patient feedback is awaited. Encourage patients to share their experiences after their consultation.";
      break;

    case "awaiting":
      title = "Awaiting Payment Appointments";
      subtitle =
        "View appointments that are awaiting payment. Ensure patients complete the payment process to confirm their appointments.";
      break;

    case "pending":
      title = "Pending Appointments";
      subtitle =
        "Track appointments that are pending further confirmation or action. Follow up with patients to finalize details.";
      break;

    case "failed":
      title = "Failed Appointments";
      subtitle =
        "Monitor appointments that have failed due to payment or system errors. Contact patients to resolve any issues.";
      break;

    case "completed":
      title = "Completed Appointments";
      subtitle =
        "View all completed appointments. Ensure all feedback and follow-up actions have been addressed.";
      break;

    default:
      title = "Appointments Overview";
      subtitle = "View the status of all appointments.";
      break;
  }

  return { title, subtitle };
}

export function getInternationalMobileFormat(mobileNumber: string) {
  if (mobileNumber?.startsWith("0")) {
    return "+233" + mobileNumber?.slice(1);
  }

  if (mobileNumber?.startsWith("233")) {
    return "+" + mobileNumber;
  }

  return mobileNumber;
}
