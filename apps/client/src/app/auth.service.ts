import { Injectable } from '@angular/core';
import { KeycloakService } from 'keycloak-angular';
import { IPerson } from '../../../../libs/ersdlib/src/lib/person';
import { HttpClient } from '@angular/common/http';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CreatePersonComponent } from './create-person/create-person.component';
import { formatHumanName } from '../../../../libs/ersdlib/src/lib/helper';
import { Router } from '@angular/router';

export interface KeycloakProfile extends Keycloak.KeycloakProfile {
  attributes: {
    [key: string]: string[];
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  public loggedIn: boolean;
  public profile: KeycloakProfile;
  public roles: string[];
  public person: IPerson;
  public logoutInProgress: boolean = false;

  constructor(
    private modalService: NgbModal,
    private httpClient: HttpClient,
    private keycloakService: KeycloakService,
    private router: Router) {
  }

  public get fullName(): string {
    if (this.loggedIn) {
      if (this.person && this.person.name && this.person.name.length > 0) {
        return formatHumanName(this.person.name[0]);
      }
      if (this.profile) {
        return `${this.profile.firstName} ${this.profile.lastName}`;
      }
    }

    return 'Not logged in';
  }

  public get isAdmin() {
    return this.roles && this.roles.indexOf('admin') >= 0;
  }

  public login() {
    // noinspection JSIgnoredPromiseFromCall
    this.keycloakService.login();
  }

  public register() {
    // noinspection JSIgnoredPromiseFromCall
    this.keycloakService.register();
  }

  public logout() {
    // Check if logout is already in progress
    if (this.logoutInProgress) {
      return;
  }
  this.logoutInProgress = true;

  this.keycloakService.logout().then(() => { 
      this.loggedIn = false;
      this.profile = null;
      this.person = null;
      this.roles = [];
      localStorage.removeItem('kc.token');
      localStorage.removeItem('kc.idToken');
      localStorage.removeItem('kc.refreshToken');
      this.logoutInProgress = false;
      this.router.navigate(['/']);
  });
}

  public checkSession() {
    const createUser = () => {
      const modalRef = this.modalService.open(CreatePersonComponent, { size: 'lg', backdrop: 'static'});
      modalRef.componentInstance.profile = this.profile;

      modalRef.result
        .then((person: IPerson) => this.person = person)
        .catch((err) => console.error(err));
    };

    this.loggedIn = this.keycloakService.isLoggedIn()

    return Promise.all([
      this.keycloakService.loadUserProfile(),
      this.keycloakService.getUserRoles(true)
    ])
    .then((data) => {
      if (data) {
        this.profile = <KeycloakProfile> data[0];
        this.roles = <string[]> data[1];

        const kc = this.keycloakService.getKeycloakInstance();
        localStorage.setItem('kc.token', kc.token);
        localStorage.setItem('kc.idToken', kc.idToken);
        localStorage.setItem('kc.refreshToken', kc.refreshToken);

        this.httpClient.get<IPerson>('/api/user/me').toPromise()
          .then((person) => {
            this.person = person;
          })
          .catch((err) => {
            if (err.status === 404) {
              createUser();
            } else {
              console.error(err);
            }
          });
      }
    })
    .catch((err) => {
      console.error(err);
    });
  }
}
