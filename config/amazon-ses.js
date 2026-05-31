const {
  SESClient,
  Destination$,
  SendEmailCommand,
} = require("@aws-sdk/client-ses");

const sesClient = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const sendEmail = async (toEmail, emailSubject, emailBody) => {
  try {
    const params = {
      Source: process.env.AWS_EMAIL,
      Destination$: { ToAddress: [toEmail] },
      Message: {
        Subject: { Data: emailSubject },
        Body: { Text: { Data: emailBody } },
      },
    };

    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);

    console.log("email sent successfully! message id: ", Response.MessageId);
  } catch (error) {
    console.log("amazon ses error:", error);
  }
};

module.exports = sendEmail;
