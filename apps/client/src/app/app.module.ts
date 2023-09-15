import { BrowserModule } from '@angular/platform-browser';
import { APP_INITIALIZER, NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { AdminComponent } from './admin/admin.component';
import { NgbModule, NgbNavModule } from '@ng-bootstrap/ng-bootstrap';
import { RouterModule, Routes } from '@angular/router';
import { SubscriptionComponent } from './subscription/subscription.component';
import { ApiKeysComponent } from './api-keys/api-keys.component';
import { ReleaseCandidateComponent } from './release-candidate/release-candidate.component';
import { HomeComponent } from './home/home.component';
import { ContactInfoComponent } from './contact-info/contact-info.component';
import { FormsModule } from '@angular/forms';
import { KeycloakAngularModule, KeycloakService } from 'keycloak-angular';
import { HttpClient, HttpClientModule, HTTP_INTERCEPTORS} from '@angular/common/http';
import { AuthService } from './auth.service';
import { CreatePersonComponent } from './create-person/create-person.component';
import { EditPersonComponent } from './edit-person/edit-person.component';
import { AdminEditPersonComponent } from './admin/edit-person/edit-person.component';
import { IClientConfig } from '../../../../libs/ersdlib/src/lib/client-config';
import { ConfigService } from './config.service';
import { UpdateNoticeComponent } from './update-notice/update-notice.component';
import { SpecDownloadComponent } from './spec-download/spec-download.component';
import { HttpRequestInterceptor } from './loading-spinner/http-interceptor';
import { MarkdownModule } from 'ngx-markdown';

const appRoutes: Routes = [
  { path: 'admin',            component: AdminComponent },
  { path: 'subscription',     component: SubscriptionComponent },
  { path: 'api-keys',         component: ApiKeysComponent },
  { path: 'release-candidate',         component: ReleaseCandidateComponent },
  { path: 'contact-info',     component: ContactInfoComponent },
  { path: 'home',             component: HomeComponent },
  { path: '',
    redirectTo: '/home',
    pathMatch: 'full'
  }
];

export function initializer(keycloak: KeycloakService, httpClient: HttpClient, configService: ConfigService): () => Promise<any> {
  const token = localStorage.getItem('kc.token');
  const idToken = localStorage.getItem('kc.idToken');
  const refreshToken = localStorage.getItem('kc.refreshToken');

  return (): Promise<any> => {
    return httpClient.get('/api/config').toPromise()
      .then((config: IClientConfig) => {
        Object.assign(configService, config);

        return keycloak.init({
          config: config.keycloak,
          initOptions: {
            onLoad: 'check-sso',
            checkLoginIframe: false,
            token: token,
            idToken: idToken,
            refreshToken: refreshToken
          },
          bearerExcludedUrls: []
        });
      });
  };
}

@NgModule({
  // @ts-ignore
  entryComponents: [
    CreatePersonComponent,
    AdminEditPersonComponent
  ],
  declarations: [
    AppComponent,
    AdminComponent,
    SubscriptionComponent,
    ApiKeysComponent,
    ReleaseCandidateComponent,
    HomeComponent,
    ContactInfoComponent,
    CreatePersonComponent,
    EditPersonComponent,
    AdminEditPersonComponent,
    UpdateNoticeComponent,
    SpecDownloadComponent
  ],
  imports: [
    BrowserModule,
    NgbModule,
    NgbNavModule,
    HttpClientModule,
    RouterModule.forRoot(appRoutes, { enableTracing: true, useHash: true }),
    FormsModule,
    KeycloakAngularModule,
    MarkdownModule.forRoot(),
  ],
  providers: [
    AuthService,
    ConfigService,
    { provide: HTTP_INTERCEPTORS, useClass: HttpRequestInterceptor, multi: true },
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: initializer,
      deps: [KeycloakService, HttpClient, ConfigService]
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
