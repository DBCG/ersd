import {
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  BadRequestException,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import {AuthGuard} from '@nestjs/passport';
import {IPerson, Person} from '../../../../../libs/ersdlib/src/lib/person';
import type {AuthRequest} from '../auth-module/auth-request';
import {Constants} from '../../../../../libs/ersdlib/src/lib/constants';
import {IBundle} from '../../../../../libs/ersdlib/src/lib/bundle';
import {Subscription} from '../../../../../libs/ersdlib/src/lib/subscription';
import {buildFhirUrl} from '../helper';
import {AppService} from '../app.service';

@Controller('user')
@UseGuards(AuthGuard())
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private httpService: HttpService, protected appService: AppService) {
  }


  @Get()
  async getAllPeople(@Req() request: AuthRequest): Promise<Person[]> {
    this.appService.assertAdmin(request);

    let people: Person[] = [];
    const getNext = (url?: string): Promise<void> => {
      if (!url) {
        url = this.appService.buildFhirUrl('Person', null, { _summary: true });
      }

      return new Promise((resolve, reject) => {
        this.httpService.get<IBundle>(url).toPromise()
          .then((results) => {
            const bundle = results.data;

            if (bundle.entry) {
              const resources = bundle.entry.map((entry) => new Person(entry.resource));
              people = people.concat(resources);
            }

            if (bundle.link) {
              const foundNext = bundle.link.find((link) => link.relation === 'next');

              if (foundNext) {
                const nextParams = foundNext.url.substring(foundNext.url.indexOf('?'));
                const nextUrl = this.appService.serverConfig.fhirServerBase + nextParams;

                getNext(nextUrl)
                  .then(() => resolve())
                  .catch((err) => reject(err));
              } else {
                resolve();
              }
            }
          });
      });
    };

    await getNext();    // get all people
    return people;
  }

  @Get('me')
  async getMyPerson(@Req() request: AuthRequest): Promise<Person> {
    const identifierQuery = Constants.keycloakSystem + '|' + request.user.sub;

    this.logger.log(`Searching for existing person with identifier ${identifierQuery}`);
    let results
    try {
      results = await this.httpService.request<IBundle>({
        url: this.appService.buildFhirUrl('Person', null, { identifier: identifierQuery }),
        headers: {
          'cache-control': 'no-cache'
        }
      }).toPromise();
    } catch (e) {
      this.logger.log(`User ${identifierQuery} was not found`)
      throw new NotFoundException();
    }

    const peopleBundle = results?.data || {};

    if (peopleBundle) {
      if (peopleBundle.total === 1) {
        this.logger.log(`Found a single person with identifier ${identifierQuery}`);// update message
        return <Person>peopleBundle.entry[0].resource;
      } else if (peopleBundle.total === 0) {
        throw new NotFoundException();
      } else if (peopleBundle.total > 1) {
        // TODO: Not sure how we get into this use case but we need to figure out how to handle in future if such exists
        this.logger.error(`Found multiple people with identifier ${identifierQuery}`);
      }
    }

    throw new InternalServerErrorException(`Did not find any people with identifier ${identifierQuery}`);
  }

  async enableSubscriptions(person: Person) {
    const maxNotifications = this.appService.serverConfig.contactInfo ? this.appService.serverConfig.contactInfo.maxNotifications : 0;

    // Subscriptions aren't enable, so we shouldn't turn the subscriptions on.
    if (!this.appService.serverConfig.enableSubscriptions) {
      return;
    }

    // If the person hasn't had the maximum notifications sent out, then they're subscriptions aren't
    // going to be turned off...
    if (!person.lastExpirationSent || person.expirationSentCount !== maxNotifications) {
      return;
    }

    this.logger.log(`The person's account has expired. Checking their subscriptions to see if any should be re-activated`);

    const getSubscriptionsPromises = (person.extension || [])
      .filter((ext) => {
        return ext.url === Constants.extensions.subscription &&
          ext.valueReference &&
          ext.valueReference.reference &&
          ext.valueReference.reference.split('/').length === 2;
      })
      .map((ext) => {
        const split = ext.valueReference.reference.split('/');
        const subscriptionUrl = buildFhirUrl(this.appService.serverConfig.fhirServerBase, 'Subscription', split[1]);
        return this.httpService.get<Subscription>(subscriptionUrl).toPromise();
      });

    const getSubscriptionsResults = await Promise.all(getSubscriptionsPromises);
    this.logger.log(`Found ${getSubscriptionsResults.length} subscriptions associated with the person`);
    const inactiveSubscriptions = getSubscriptionsResults.filter(result => result.data.status !== 'active');
    this.logger.log(`Re-activating ${inactiveSubscriptions.length} subscriptions for the person`);

    const updateSubscriptionPromises = inactiveSubscriptions
      .map((result) => {
        const subscription = result.data;
        subscription.status = 'requested';

        const subscriptionUrl = this.appService.buildFhirUrl('Subscription', subscription.id);
        return this.httpService.put<Subscription>(subscriptionUrl, subscription).toPromise();
      });

    await Promise.all(updateSubscriptionPromises);
  }

  @Post('me')
  async updateMyPerson(@Req() request: AuthRequest, @Body() body: Person): Promise<Person> {
    const updatePerson = new Person(body);
    if (!updatePerson.isValid()) {
      this.logger.error('Person is not valid, missing required fields');
      throw new BadRequestException('missing required fields');
    }
    updatePerson.identifier = updatePerson.identifier || [];

    let foundIdentifier = updatePerson.identifier.find((identifier) => identifier.system === Constants.keycloakSystem);

    if (!foundIdentifier) {
      foundIdentifier = {
        system: Constants.keycloakSystem,
        value: request.user.sub
      };
      updatePerson.identifier.push(foundIdentifier);
    }

    let existingPerson;

    try {
      existingPerson = await this.getMyPerson(request);
    } catch (ex) {
      this.logger.error(`Error when getting existing person: ${ex.message}`);
    }

    if (!existingPerson) {
      const newSubscriptionUrl = this.appService.buildFhirUrl('Subscription');
      let newSubscriptionResults;
      let newSubscription = new Subscription();
      newSubscription.criteria = this.appService.serverConfig.subscriptionCriteria;
      newSubscription.channel.type = 'email';
      newSubscription.channel.endpoint = 'mailto:' + updatePerson.email;
      // include artifacts to new user subscriptions by pre-pending "application/[json or xml]" before ";bodytext" 
      newSubscription.channel.payload = ';bodytext=' + Buffer.from(Constants.defaultEmailBody).toString('base64'); 
      newSubscription.status = this.appService.serverConfig.enableSubscriptions ? 'active' : 'off'; // In the new hapi fhir we are using 'active' instead of 'requested'

      this.logger.log(`Person does not already exist. Creating default subscriptions for new person via url: ${newSubscriptionUrl}`);

      try {
        newSubscriptionResults = await this.httpService.post<Subscription>(newSubscriptionUrl, newSubscription).toPromise();
      } catch (ex) {
        this.logger.error(`Error when creating default subscription for new user: ${ex}`);
        throw new InternalServerErrorException(ex.message);
      }

      newSubscription = new Subscription(newSubscriptionResults.data);

      this.logger.log(`Adding default subscription to Person resource`);

      updatePerson.extension = updatePerson.extension || [];
      updatePerson.extension.push({
        url: Constants.extensions.subscription,
        valueReference: {
          reference: 'Subscription/' + newSubscription.id
        }
      });
    } else {
      // Ensure the person's subscriptions are enabled if they are not a new person
      await this.enableSubscriptions(existingPerson);
    }

    this.logger.log('Sending request to FHIR server to update the Person resource');

    let updatePersonRequest;

    try {
      updatePersonRequest = await this.httpService.request<Person>({
        method: existingPerson ? 'PUT' : 'POST',
        url: this.appService.buildFhirUrl('Person', existingPerson ? existingPerson.id : ''),
        data: updatePerson
      }).toPromise();
    } catch (ex) {
      this.logger.error(`Error when updating Person resource on FHIR server: ${ex}`);
      throw new InternalServerErrorException(ex.message);
    }

    this.logger.log('Done updating person resource, responding with updated person');

    return updatePersonRequest.data;
  }

  @Get(':id')
  async getUser(@Req() request: AuthRequest, @Param('id') id: string): Promise<Person> {
    this.appService.assertAdmin(request);

    const url = this.appService.buildFhirUrl('Person', id);
    const results = await this.httpService.get<Person>(url).toPromise().catch((err) => {
      this.logger.error(`Error retrieving person ${id}: ${err.message}`);
      throw new InternalServerErrorException('Error retrieving person ' + err.message);
    });
    return results.data;
  }

  @Put(':id')
  async updateUser(@Req() request: AuthRequest, @Param('id') id: string, @Body() body: Person) {
    this.appService.assertAdmin(request);

    const url = this.appService.buildFhirUrl('Person', id);
    const results = await this.httpService.put<IPerson>(url, body).toPromise().catch((err) => {
      this.logger.error(`Error updating person ${id}: ${err.message}`);
      throw new InternalServerErrorException(err.message);
    });

    return results.data; // Return the data from the response to the client
  }

  private async deleteUserById(id: string) {
    this.logger.log(`Deleting person ${id}. Retrieving the Person resource to determine what all should be deleted.`);

    const url = this.appService.buildFhirUrl('Person', id);

    const getResults = await this.httpService.get<Person>(url).toPromise().catch((err) => {
      this.logger.error(`Error retrieving person ${id}: ${err.message}`);
      throw new NotFoundException('Person not found');
    });
    const person = getResults.data;

    const subscriptionExtensions = (person.extension || [])
      .filter((ext) => {
        return ext.url === Constants.extensions.subscription &&
          ext.valueReference &&
          ext.valueReference.reference &&
          ext.valueReference.reference.split('/').length === 2
      });

    this.logger.log(`Found ${subscriptionExtensions.length} subscriptions associated with person ${person.id}`);

    try {
      const deletePromises = subscriptionExtensions
        .map((ext) => {
          const split = ext.valueReference.reference.split('/');

          this.logger.log(`Deleting subscription ${split[1]} associated with person ${person.id}`);

          const subscriptionUrl = this.appService.buildFhirUrl('Subscription', split[1]);
          return this.httpService.delete(subscriptionUrl).toPromise().catch((err) => {
            this.logger.error(`Error deleting subscription ${split[1]} associated with person ${person.id}: ${err.message}`);
          });
        });

      await Promise.all(deletePromises);

      this.logger.log(`Done deleting all subscriptions associated with person ${person.id}`);
    } catch (ex) {
      this.logger.error(`Error removing subscriptions for person ${person.id}: ${ex.message}`);
    }

    this.logger.log(`Deleting person ${person.id}`);

    await this.httpService.delete(url).toPromise().catch((err) => {
      this.logger.error(`Error deleting person ${person.id}: ${err.message}`);
    });

    this.logger.log(`Done deleting person ${person.id}`);
  }

  @Delete('me')
  async deleteMe(@Req() request: AuthRequest) {
    const me = await this.getMyPerson(request);

    if (!me) {
      throw new Error('No Person found for the logged in user');
    }

    this.deleteUserById(me.id);
  }

  @Delete(':id')
  async deleteUser(@Req() request: AuthRequest, @Param('id') id: string) {
    this.appService.assertAdmin(request);
    this.deleteUserById(id);
  }
}
