import { Component, OnInit } from '@angular/core';
import { AuthService } from './auth.service';
import { HttpClient } from '@angular/common/http';
import packageInfo from "../../../../package.json";
import { Router, NavigationEnd } from '@angular/router';

@Component({
  selector: 'ersd-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  versionText = 'eRSD Version: '+packageInfo.version;
  showNotification: boolean;

  constructor(
    public authService: AuthService,
    private router: Router) {

      this.router.events.subscribe((event) => {
        if (event instanceof NavigationEnd) {
          // Check if the current route is the home page
          this.showNotification = event.url === '/home';
        }
      });
    }

  ngOnInit(): void {
    this.authService.checkSession();
  }
}
