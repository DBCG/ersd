import { 
  BadRequestException,
  Controller,
  Get,

  Logger,
  Query, 
  Req, 
  Response, 
  UnauthorizedException
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Response as Res } from 'express';
import { Request } from 'express';
import { Constants } from '../../../../../libs/ersdlib/src/lib/constants';
import { IBundle } from '../../../../../libs/ersdlib/src/lib/bundle';
import { Person } from '../../../../../libs/ersdlib/src/lib/person';
import { AppService } from '../app.service';
import S3 from 'aws-sdk/clients/s3';
import { Fhir } from 'fhir/fhir';

@Controller('ersd')
export class eRSDController {
  private readonly logger = new Logger('eRSDController');
  constructor(private httpService: HttpService, private appService: AppService) {
  }

  private validFormat(format): boolean { return format === 'xml' || format === 'json' || format ==='md'}
  
  private assertApiKey(request: Request): Promise<Person> {
    let authorization: string;

    if (request.header('authorization')) {
      authorization = request.header('authorization');

      if (!authorization.startsWith('Bearer ')) {
        throw new UnauthorizedException('Authorization is not Bearer');
      }

      authorization = authorization.substring('Bearer '.length);
    } else if (request.query['api-key']) {
      authorization = request.query['api-key'] as string;
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

  private stripOuterBundleJSON (bundle: IBundle) {
    return bundle.entry.find((entry) => entry.resource.resourceType === 'Bundle').resource
  }

  private stripOuterBundleXML (bundle: string) {
    const fhir = new Fhir()
    const jsonBundle: IBundle = fhir.xmlToObj(bundle) as IBundle
    const bundleEntry = jsonBundle.entry.find((entry) => entry.resource.resourceType === 'Bundle').resource
    const fhirXML = fhir.objToXml(bundleEntry)
    const validationCheck = fhir.validate(fhirXML)
    if (validationCheck.valid === false) { throw Error('Invalid XML input, please check resource in S3') }
    return fhirXML
  }

  @Get('v1specification')
  async getV1Spec(@Req() request: Request, @Query() queryParams, @Response() response: Res) {
    await this.assertApiKey(request);
    const format = queryParams['format'].toLowerCase()
    if (!format || !this.validFormat(format)) { throw new BadRequestException('Please specify a valid download format: XML or JSON') }

    const Bucket = this.appService.serverConfig.payload.Bucket;
    const Key = format === 'xml' ? this.appService.serverConfig.payload.ERSDV1_XML_KEY :
      this.appService.serverConfig.payload.ERSDV1_JSON_KEY

    if (typeof Bucket === 'undefined' || Bucket === '' || Key === '') {
      const errorMessage = 'Failed to download from S3, no Bucket or Key specified'
      this.logger.error(errorMessage);
      throw Error(errorMessage);
    } 

    const s3client = new S3();

    const headParams = {
      Bucket,
      Key,
    }

    const data = await s3client.getObject(headParams).promise();
    const body = data.Body.toString('utf-8')

    if (format === 'xml') {
      return response.set({'Content-Type': 'text/xml'}).send(this.stripOuterBundleXML(body))
    } else {
      return response.set({'Content-Type': 'application/json'}).json(this.stripOuterBundleJSON(JSON.parse(body)))
    }
  }

  @Get('v2specification')
  async getV2Spec(@Req() request: Request, @Query() queryParams, @Response() response: Res) {
    await this.assertApiKey(request);

    const format = queryParams['format'].toLowerCase()
    if (!format || !this.validFormat(format)) { throw new BadRequestException('Please specify a valid download format: XML or JSON') }

    const Bucket = this.appService.serverConfig.payload.Bucket;
    const Key = format === 'xml' ? this.appService.serverConfig.payload.ERSDV2_SPECIFICATION_XML_KEY :
      this.appService.serverConfig.payload.ERSDV2_SPECIFICATION_JSON_KEY

    if (typeof Bucket === 'undefined' || Bucket === '' || Key === '') {
      const errorMessage = 'Failed to download from S3, no Bucket or Key specified'
      this.logger.error(errorMessage);
      throw Error(errorMessage);
    } 

    const s3client = new S3();

    const headParams = {
      Bucket,
      Key,
    }

    const data = await s3client.getObject(headParams).promise();
    const body = data.Body.toString('utf-8')
    if (format === 'xml') {
      return response.set({'Content-Type': 'text/xml'}).send(body)
    } else {
      return response.set({'Content-Type': 'application/json'}).json(JSON.parse(body))
    }
  }

  @Get('v2supplemental')
  async getV2Supplemental(@Req() request: Request, @Query() queryParams, @Response() response: Res) {
    if (!this.appService.serverConfig.serveV2) { throw new BadRequestException('eRSD V2 Supplemental Bundle not currently available') }
    await this.assertApiKey(request);
    
    const format = queryParams['format'].toLowerCase()
    if (!format || !this.validFormat(format)) { throw new BadRequestException('Please specify a valid download format: XML or JSON') }

    const Bucket = this.appService.serverConfig.payload.Bucket;
    const Key = format === 'xml' ? this.appService.serverConfig.payload.ERSDV2_SUPPLEMENTAL_XML_KEY :
      this.appService.serverConfig.payload.ERSDV2_SUPPLEMENTAL_JSON_KEY

    if (typeof Bucket === 'undefined' || Bucket === '' || Key === '') {
      const errorMessage = 'Failed to download from S3, no Bucket or Key specified'
      this.logger.error(errorMessage);
      throw Error(errorMessage);
    } 

    const s3client = new S3();

    const headParams = {
      Bucket,
      Key,
    }

    const data = await s3client.getObject(headParams).promise();
    const body = data.Body.toString('utf-8')
    if (format === 'xml') {
      return response.set({'Content-Type': 'text/xml'}).send(body)
    } else {
      return response.set({'Content-Type': 'application/json'}).json(JSON.parse(body))
    }
  }

  // Markdown functions
  @Get('markdown')
  async getMarkdown(@Response() response: Res) {

    const Bucket = this.appService.serverConfig.payload.Bucket;
    const Key = this.appService.serverConfig.payload.ERSD_RELEASE_CANDIDATE_KEY_MD_KEY
    

    if (typeof Bucket === 'undefined' || Bucket === '' || Key === '') {
      const errorMessage = 'Failed to download from S3, no Bucket or Key specified'
      this.logger.error(errorMessage);
      throw Error(errorMessage);
    } 

    const s3client = new S3();
    const params = {
      Bucket,
      Key,
    };

    try {
      const data = await s3client.getObject(params).promise();
      response.set('Content-Type', 'text/markdown');
      response.send(data.Body.toString());
    } catch (error) {
      console.error('Error fetching Markdown from S3:', error);
      return response.status(500).json({ error: 'Error fetching Markdown from S3' });
    }

  }
}