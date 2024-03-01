import {Body, Controller, Logger, Post, Req, Res, Header, UseGuards, InternalServerErrorException, StreamableFile, BadRequestException} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Parser, } from '@json2csv/plainjs';
import {
  string as stringFormatter,
} from '@json2csv/formatters';
import {AuthGuard} from '@nestjs/passport';
import type { AuthRequest } from '../auth-module/auth-request';
import {Constants} from '../../../../../libs/ersdlib/src/lib/constants';
import {IUploadRequest,} from '../../../../../libs/ersdlib/src/lib/upload-request';
import { IEmailExportRequest } from '../../../../../libs/ersdlib/src/lib/email-request';

import {Fhir} from 'fhir/fhir';
import {IBundle} from '../../../../../libs/ersdlib/src/lib/bundle';
import {AppService} from '../app.service';
import S3 from 'aws-sdk/clients/s3';
import path, { join } from "path";
import { validateEmail } from '../helper';
import { createReadStream, writeFileSync, unlinkSync } from 'fs';

@Controller('upload')
export class UploadController {
  private readonly logger = new Logger('UploadController');

  constructor(private httpService: HttpService, private appService: AppService) {
  }

  @Post('excel')
  @UseGuards(AuthGuard())
  async uploadExcel(@Req() request: AuthRequest, @Body() body: IUploadRequest) {
    this.appService.assertAdmin(request);

    this.logger.log('Admin is uploading an RCTC excel');
    const buf = Buffer.from(body.fileContent, 'base64');
    const Bucket = this.appService.serverConfig.payload.Bucket;
    if (typeof Bucket === 'undefined' || Bucket === "") {
      this.logger.log(`Uploading RCTC excel to local storage`);
      const rctcExcelPath = path.resolve(this.appService.serverConfig.rctcExcelPath);
      writeFileSync(rctcExcelPath, buf);
      this.logger.log(`Updated RCTC excel file at path ${rctcExcelPath}.`);
    }
    else {
      this.logger.log(`Uploading RCTC excel to s3`);
      const Metadata = {filename: body.fileName};

      try {
        const s3client = new S3();
        const Key = this.appService.serverConfig.payload.RCTCKey;
        this.logger.log(`Uploaded RCTC excel to s3://${Bucket}/${Key}`);
        const s3return = await s3client.putObject({
          Bucket,
          Key,
          Metadata,
          Body: buf,
        }).promise()
        this.logger.log(`Uploaded RCTC excel to s3://${Bucket}/${Key}`);
      }
      catch(e) {
        this.logger.error(`Failed to upload RCTC excel to s3 ${JSON.stringify(e)}`);
        throw e;
      }
    }
  }

  async getEmails(exportTypeOrigin: string) {
    let resource = [];
    const getNext = (url?: string): Promise<void> => {
      if (!url) {
        url = this.appService.buildFhirUrl(exportTypeOrigin, null, { _summary: true });
      }

      return new Promise((resolve, reject) => {
        this.httpService.get<IBundle>(url).toPromise()
          .then((results) => {
            const bundle = results.data;

            if (bundle.entry) {
              const resources = bundle.entry.map((entry) => entry.resource);
              resource = resource.concat(resources);
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

    let emails: string[] = []

    // @ts-ignore
    if (exportTypeOrigin === 'Subscription') {
      resource.forEach((i) => {
        if (i?.status !== 'active' || i?.channel?.type !== 'email' || i?.channel?.payload === 'application/json') return;
        const email = i?.channel?.endpoint?.split('mailto:')?.[1]
        if (validateEmail(email)) {
          emails.push(email)
        } else {
          this.logger.error(`Invalid email address ${email}`);
        }
      })
      } else if (exportTypeOrigin === 'Person') {
        resource?.forEach(i => {
          const primaryEmail = i?.telecom?.find(j => j.system === 'email')?.value
          const secondaryEmail = i?.contained?.find?.(c => c?.resourceType === 'Person')?.telecom?.find(j => j.system === 'email')?.value
          const allPersonEmails = [primaryEmail, secondaryEmail].map(i => i && i.replaceAll('mailto:', '')).filter(i => i)
          allPersonEmails.forEach(email => {
            if (validateEmail(email)) {
              emails.push(email)
            } else {
              this.logger.error(`Invalid email address ${email}`);
            }
          })
        })
      }
    return [...new Set(emails.map(i => i.toLowerCase()))]
  }

   @Post('get-emails')
   @UseGuards(AuthGuard())
    async getEmaisl(@Body() { exportTypeOrigin }: { exportTypeOrigin: string }) {
      const emails = await this.getEmails(exportTypeOrigin);
      return emails;
    }

  @Post('export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="emails.csv"')  
  @UseGuards(AuthGuard())
  async exportEmails(@Req() request: AuthRequest, @Res({ passthrough: true }) res: Response, @Body() body: IEmailExportRequest) {
    this.appService.assertAdmin(request);
    const exportTypeOrigin = body.exportTypeOrigin;
    if (exportTypeOrigin !== 'Subscription' && exportTypeOrigin !== 'Person' && exportTypeOrigin !== 'Both') throw new BadRequestException('Invalid export type origin');
    this.logger.log('Admin exporting email list from fhir resource:' + exportTypeOrigin);
    this.logger.log('Getting all people registered in the FHIR server');
    let emails: string[] = []
    if (exportTypeOrigin === 'Both') {
      const personEmails = await this.getEmails('Person');
      const subscriptionEmails = await this.getEmails('Subscription');
      emails = [...new Set([...personEmails, ...subscriptionEmails].map(i => i.toLowerCase()))] // get unique array of emails
    } else {
      emails = await this.getEmails(exportTypeOrigin);
    }
    this.logger.log('Found ' + emails.length + ' emails')
    try {
      this.logger.log('Converting emails to CSV');
      const parser = new Parser({
        formatters: {
          string: stringFormatter({ quote: '' }),
        }
      });
      const csv = parser.parse(emails.map(i => ({email: i})));
      writeFileSync('tmp.csv', csv)

      const stream = createReadStream(join(process.cwd(), 'tmp.csv'))
      stream.on('end', () => {
        try{
          unlinkSync('tmp.csv');
        } catch (error) {
          this.logger.warn('An error occurred while removing tmp file.');
        }
      })
      return new StreamableFile(stream);
    } catch (err) {
      this.logger.error('Error converting emails to CSV', err);
    }
  }

  @Post('bundle')
  @UseGuards(AuthGuard())
  async uploadBundle(@Req() request: AuthRequest, @Body() body: IUploadRequest) {

    this.appService.assertAdmin(request);

    this.logger.log('Admin is uploading a bundle');

    let resource;
    let xmlData;

    // Parse the JSON or XML
    if (body.fileName.endsWith('.xml')) {
      this.logger.log('Upload is an XML file. Converting to JSON');

      const fhir = new Fhir();
      xmlData = body.fileContent;
      resource = fhir.xmlToObj(body.fileContent);
    } else if (body.fileName.endsWith('.json')) {
      this.logger.log('Upload is already JSON');

      resource = JSON.parse(body.fileContent);
      const fhir = new Fhir();
      xmlData = fhir.objToXml(resource);
    }

    // Attach the message to the bundle being uploaded
    if (body.message && resource.resourceType === 'Bundle') {
      const bundle = <IBundle> resource;

      this.logger.log('Creating an extension on the first entry in the bundle being upload that includes the message from the admin');

      if (bundle.entry && bundle.entry.length > 0 && bundle.entry[0].resource) {
        const firstResource = bundle.entry[0].resource;

        firstResource.extension = firstResource.extension || [];
        firstResource.extension.push({
          url: Constants.extensions.notificationMessage,
          valueString: body.message
        });
      }
    }

    try {
      const Bucket = this.appService.serverConfig.payload.Bucket;
      if (typeof Bucket === 'undefined' || Bucket === "") {
        this.logger.log(`Uploading bundle to local storage`);
        const bundlePath = path.resolve(this.appService.serverConfig.bundlePath);
        writeFileSync(bundlePath, xmlData);
        this.logger.log(`Updated bundle file at path ${bundlePath}.`);
      }
      else {
        const s3client = new S3();
        const Key = this.appService.serverConfig.payload.Key;
        const Metadata = {filename: body.fileName};

        const s3return = await s3client.putObject({
          Bucket,
          Key,
          Metadata,
          Body: xmlData,
        }).promise()
        this.logger.log(`Uploaded bundle to s3://${Bucket}/${Key}`);
      }
    }
    catch(e) {
      this.logger.error(`Failed to upload bundle ${JSON.stringify(e)}`);
      throw e;
    }

    this.logger.log('Posting the transaction to the FHIR server');

    try {
      const requestUrl = this.appService.buildFhirUrl(resource.resourceType, resource.id);
      let response;

      const config = {
        maxContentLength: 2147483648,
        maxBodyLength: 2147483648,

      }
      if (resource.id) {
        response = await this.httpService.put(requestUrl, resource, config).toPromise();
      } else {
        response = await this.httpService.post(requestUrl, resource, config).toPromise();
      }

      this.logger.log('Done uploading to FHIR server');
    } catch (ex) {
      this.logger.error(`Error occurred while posting the transaction to the FHIR server: ${ex.status} - ${ex.message}`);

      if (ex.response && ex.response.data) {
        this.logger.error(ex.response.data);
      }

      throw ex;
    }
  }
}
