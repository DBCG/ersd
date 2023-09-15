import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface PayloadDownload {
  url: string;
}

@Component({
  selector: 'release-candidate',
  templateUrl: './release-candidate.component.html',
  styleUrls: ['./release-candidate.component.css']
})
export class ReleaseCandidateComponent implements OnInit {
  request: any = {}
  version = 'ecrv1'
  bundleType = ''
  contentType = 'json'
  markdownContent: string = '';
  draftVersion : string = '';


  constructor(
    private httpClient: HttpClient,
  ) { }

  ngOnInit() {
    this.httpClient.get('/api/ersd/markdown', { responseType: 'text' }).subscribe((data) => {
      this.markdownContent = data;
    });

  }  

  async getReleaseCandidate(e) {
    let url = "";

    const button = e.target as HTMLButtonElement;
    this.draftVersion = button.name;

    // this.draftVersion = e.target.value  // eRSD Draft V1 or V2
    if (this.draftVersion == 'ersdv1-draft-json') {  
      url = 'api/download/release-candidate-v1-draft-json'
    } 
    if (this.draftVersion == 'ersdv1-draft-xml') {
      url = 'api/download/release-candidate-v1-draft-xml'
    }
    if (this.draftVersion == 'ersdv2-draft-json') {  
      url = 'api/download/release-candidate-v2-draft-json'
    } 
    if (this.draftVersion == 'ersdv2-draft-xml') {
      url = 'api/download/release-candidate-v2-draft-xml'
    }

    this.httpClient
      .post(url, this.request)
      .toPromise()
      .then(async (data: PayloadDownload) => {
        await this.downloadS3(data)
      })
      .catch(err => {
        console.error(err);
      });
  }

  async downloadS3(data: PayloadDownload) {
    var a = document.createElement('a');
    a.href = data.url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
  }
}
