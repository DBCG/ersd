import {All, BadRequestException, Controller, Req, UnauthorizedException} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import {Request} from 'express';
import {Constants} from '../../../../../libs/ersdlib/src/lib/constants';
import {IBundle} from '../../../../../libs/ersdlib/src/lib/bundle';
import {Person} from '../../../../../libs/ersdlib/src/lib/person';
import {map} from 'rxjs/operators';
import {joinUrl} from '../helper';
import {AppService} from '../app.service';
// @ts-nocheck

@Controller('fhir')
export class FhirController {
  constructor(private httpService: HttpService, private appService: AppService) {
  }

  private assertApiKey(request: Request): Promise<Person> {
    let authorization: string;

    if (request.header('authorization')) {
      authorization = request.header('authorization');

      if (!authorization.startsWith('Bearer ')) {
        throw new UnauthorizedException('Authorization is not Bearer');
      }

      authorization = authorization.substring('Bearer '.length);
    } else if (request.query['api-key']) {
      // @ts-ignore
      authorization = request.query['api-key'];
    } else {
      throw new UnauthorizedException('You have not specified an authorization key');
    }

    const tagQuery = `${Constants.tags.inboundApiKey}|${authorization}`;
    const url = this.appService.buildFhirUrl('Person', null, { _tag: tagQuery });

    return this.httpService.get<IBundle>(url).toPromise()
      .then((results) => {
        const bundle = results.data;

        if (bundle.total > 1) {
          throw new UnauthorizedException('Multiple users are associated with the specified API key. Cannot authenticate.');
        }

        if (bundle.total === 0) {
          throw new UnauthorizedException();
        }

        return new Person(bundle.entry[0].resource);
      });
  }

  @All('*')
  async getData(@Req() request: Request) {
    await this.assertApiKey(request);
    let fhirPart = request.originalUrl.substring('/api/fhir'.length);

    if (fhirPart.startsWith('/')) {
      fhirPart = fhirPart.substring(1);
    }

    if (request.method !== 'GET') {
      throw new BadRequestException(`This FHIR server is a read-only server and only supports GET requests. ${request.method} is not allowed.`);
    }

    if (!fhirPart || fhirPart.startsWith('$')) {
      throw new BadRequestException('Requests against the base/root of the FHIR server are not allowed.');
    }

    let resourceType = fhirPart.indexOf('/') > 0 ? fhirPart.substring(0, fhirPart.indexOf('/')) : fhirPart;

    if (resourceType.indexOf('?') > 0) {
      resourceType = resourceType.substring(0, resourceType.indexOf('?'));
    }

    const restrictedResourceTypes = this.appService.serverConfig.restrictedResourceTypes ?
      this.appService.serverConfig.restrictedResourceTypes.map((rt) => rt.toLowerCase()) :
      [];

    if (restrictedResourceTypes.indexOf(resourceType.toLowerCase()) >= 0) {
      throw new BadRequestException(`Requests for the resource type ${resourceType} are not allowed`);
    }

    let queryParams;

    if (fhirPart.indexOf('?') > 0) {
      queryParams = fhirPart.substring(fhirPart.indexOf('?') + 1);
      fhirPart = fhirPart.substring(0, fhirPart.indexOf('?'));

      const queryParamsSplit = queryParams.split('&');

      for (let i = queryParamsSplit.length - 1; i >= 0; i--) {
        if (queryParamsSplit[i].startsWith('api-key=')) {
          queryParamsSplit.splice(i, 1);
        }
      }

      queryParams = queryParamsSplit.join('&');
    }

    let fhirUrl = joinUrl(this.appService.serverConfig.fhirServerBase, fhirPart);

    if (queryParams) {
      fhirUrl += '?' + queryParams;
    }

    const headers = request.headers;
    delete headers['authorization'];
    delete headers['cookie'];
    delete headers['host'];

    return this.httpService.get(fhirUrl, { headers: headers }).pipe(
      map(response => response.data)
    );
  }
}
