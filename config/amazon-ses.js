const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const {
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_EMAIL,
} = require("./env");

const sesClient = new SESClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const sendEmail = async (toEmail, emailSubject, emailBody, emailHtml) => {
  try {
    const params = {
      Source: AWS_EMAIL,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: emailSubject },
        Body: {
          Text: { Data: emailBody },
          Html: emailHtml ? { Data: emailHtml } : undefined,
        },
      },
    };

    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);

    console.log("email sent successfully! message id: ", response.MessageId);
  } catch (error) {
    console.log("amazon ses error:", error);
  }
};

module.exports = sendEmail;
