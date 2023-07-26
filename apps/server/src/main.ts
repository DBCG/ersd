import {NestFactory} from '@nestjs/core';
import {AppModule} from './app/app.module';
import {Logger} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {CheckContactInfo} from './check-contact-info';
import {AppService} from './app/app.service';

// import * as bodyParser from 'body-parser';
import * as path from 'path';
import * as fs from 'fs';

const appService = new AppService();
const logger = new Logger('bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix(`api`);

  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { limit: '50mb', extended: true });
  app.useStaticAssets(path.join(__dirname, '/../client'));

  const port = process.env.port || appService.serverConfig.port || 3333;
  await app.listen(port, () => {
    logger.log(`Listening at http://localhost:${port}`);
    logger.log(`Server configured to use FHIR server ${appService.serverConfig.fhirServerBase}`);
  });
}

if (!appService.serverConfig.fhirServerBase) {
  logger.error('Server is not configured with a FHIR server. Cannot continue');
  process.exit(1);
}

try {
  CheckContactInfo.execute(appService.serverConfig.fhirServerBase, appService.serverConfig.contactInfo, appService.emailConfig);
} catch { }

if (!appService.serverConfig.rctcExcelPath) {
  throw new Error('"rctcExcelPath" is not configured. Cannot continue.');
}

const rctcExcelPath = path.resolve(appService.serverConfig.rctcExcelPath);
const rctcExcelDir = path.dirname(rctcExcelPath);

if (!fs.existsSync(rctcExcelDir)) {
  throw new Error(`The directory for "rctcExcelPath" (${rctcExcelDir}) does not exist. It must exist to continue.`);
}

bootstrap();

