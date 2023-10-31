
export class Constants {
  static readonly authPrefix = 'Authorization: Bearer ';
  static readonly defaultEmailSubject = 'Electronic Case Reporting Update Notification';
  static readonly defaultEmailBody = '\n---------------------------\n' +
    '\n' +
    'Thank you for using the eRSD notification service. eRSD distributions should always be implemented in a timely manner to address critical public health surveillance needs.';
  static readonly keycloakSystem = 'https://www.keycloak.org/';
  static readonly extensions = {
    secondaryContact: 'https://kds.com/extension-person-secondary-contact',
    organizationTitle: 'https://kds.com/extension-person-organization-title',
    subscription: 'https://kds.com/extension-person-subscription',
    notificationMessage: 'http://jamesagnew.github.io/hapi-fhir/StructureDefinition/ext-subscription-email-body',
    lastExpirationSent: 'https://kds.com/extension-last-expiration-sent',
    expirationSentCount: 'https://kds.com/extension-expiration-sent-count'
  };
  static readonly tags = {
    inboundApiKey: 'https://kds.com/inbound-api-key'
  };
}
