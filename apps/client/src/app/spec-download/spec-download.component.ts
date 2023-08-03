import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import saveAs from 'save-as';
import { firstValueFrom } from 'rxjs';

interface PayloadDownload {
  url: string;
}

@Component({
  selector: 'ersd-spec-download',
  templateUrl: './spec-download.component.html',
  styleUrls: ['./spec-download.component.css']
})

export class SpecDownloadComponent implements OnInit {
  request: any = {}

  showV2 = false
  version = "ecrv1"
  bundleType = ""
  contentType = "json"

  constructor(
    private httpClient: HttpClient
  ) { }

  ngOnInit() {
  }

  setBundle(e) { 
    this.bundleType = e.target.value 
  }

  setVersion(e) { 
    this.version = e.target.value
  }

  setContentType(e) { 
    this.contentType = e.target.value 
  }

  buildFileName() {
    if (this.bundleType !== "") {
      return `${this.version}-${this.bundleType}.${this.contentType}`
    }
    return `${this.version}.${this.contentType}`
  }

  async handleSubmit() {
    let url = ""
    try {
      if (this.version == "ecrv2") {
        if(this.bundleType == "") { 
          throw Error('Please select a bundle type') 
        } 
        url = `/api/s3/${this.contentType}?version=${this.version}&bundle=${this.bundleType}`
      } else {
        url = `/api/s3/${this.contentType}?version=${this.version}`
      }
      if (this.contentType === 'json') {
        return this.queryServer(url)
      } else {
        return this.queryServerXML(url)
      }
    } catch (err) {
      alert(`Error while downloading file: ${err.message}`);
      console.error(err);
    }
  }

  async downloadFile(data, filename?) {
    let blob: Blob;
    if (this.contentType === 'json') {
      blob = new Blob([JSON.stringify(data, null, 2)],{ type: 'application/json;charset=utf-8' })
    } else if (this.contentType === 'xml') {
      blob = new Blob([data],{ type: 'text/xml' })
    }
    saveAs(blob, filename);
  }

  async queryServer(url) {
    try {
      const data = await firstValueFrom(this.httpClient.post(url, this.request));
      await this.downloadFile(data, this.buildFileName());
    } catch (err) {
      console.error(err);
    }
  }

  async queryServerXML(url) {
    try {
      this.httpClient
        .get(url, { responseType: 'text' })
        .subscribe(async result => {
          await this.downloadFile(result, this.buildFileName())
        })
    } catch (err) {
      alert(`Error downloading file: ${err.message}`)
      console.error(err)
    }
  }
  async downloadExcel() {
    try {
      const data = await firstValueFrom(this.httpClient.post('/api/download/excel', this.request)) as PayloadDownload;
      await this.downloadS3(data.url);
    } catch (err) {
      console.log(err);
    }
  }

  async downloadS3(url) {
    var a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
  }

}
