<!--
  Title: COVID-19 API for India
  Description: APIs for India specific COVID-19 data
  Author: amodm
  -->

## Archived
This repo is now archived, given the lack of further development. The API endpoints themselves continue to be available
as of this writing, but are not guaranteed to exist in future.

# COVID-19 REST API for India

API for COVID-19 stats in India, sourced from [The Ministry of Health and Family Welfare](https://www.mohfw.gov.in/)
and separately from [unofficial sources](#unofficial-sources)

## API

#### Official data
* Case counts:
  * https://api.rootnet.in/covid19-in/stats/latest
  * https://api.rootnet.in/covid19-in/stats/history
* Testing stats:
  * https://api.rootnet.in/covid19-in/stats/testing/latest
  * https://api.rootnet.in/covid19-in/stats/testing/history
  * https://api.rootnet.in/covid19-in/stats/testing/raw
* Hospitals & beds:
  * https://api.rootnet.in/covid19-in/hospitals/beds
  * https://api.rootnet.in/covid19-in/hospitals/medical-colleges
* Contact & helpline: https://api.rootnet.in/covid19-in/contacts
* Notifications & advisories: https://api.rootnet.in/covid19-in/notifications

#### Unofficial data
* Unofficial sources: https://api.rootnet.in/covid19-in/unofficial/sources
* Unofficial patient tracing data: https://api.rootnet.in/covid19-in/unofficial/covid19india.org
* Unofficial statewise: https://api.rootnet.in/covid19-in/unofficial/covid19india.org/statewise
* Unofficial statewise history: https://api.rootnet.in/covid19-in/unofficial/covid19india.org/statewise/history
* Unofficial patient travel history (NOT MAINTAINED ANYMORE by upstream): https://api.rootnet.in/covid19-in/unofficial/covid19india.org/travelhistory

#### Maintenance
* Refresh the data from source (maintainer only) https://api.rootnet.in/covid19-in/refresh

## Sources
* Post Mar 15, data is from [The Ministry of Health & Family Welfare](https://www.mohfw.gov.in/)
* Pre  Mar 15, data is sourced from [datameet/covid19](https://github.com/datameet/covid19/tree/eb1cc65657929abe12ca59f0e754bef4bc562d7a/mohfw-backup)
* Hospital & bed data: https://api.steinhq.com/v1/storages/5e732accb88d3d04ae0815ae/StateWiseHealthCapacity
* ICMR testing stats API: https://api.steinhq.com/v1/storages/5e6e3e9fb88d3d04ae08158c/ICMRTestData
* Medical colleges data: https://api.steinhq.com/v1/storages/5e6e3e9fb88d3d04ae08158c/Hospitals

## Unofficial sources
* The awesome volunteer driven patient tracing data [covid19india.org](https://www.covid19india.org/)
* API (NLP): http://coronatravelhistory.pythonanywhere.com/
* API (Travel history): https://api.covid19india.org/travel_history.json

## For contributors

This is created using [Cloudflare Wrangler](https://github.com/cloudflare/wrangler), and hosted on Cloudflare

#### Credits
* Awesome team at [covid19india.org](https://www.covid19india.org/)
* Hospital & medical colleges data API from [@NirantK](https://github.com/NirantK)
* ICMR testing data API from [covid19india.org](https://api.covid19india.org/data.json)
* [NLP data API](https://github.com/NirantK/coronaindia) from [@meghanabhange](https://github.com/meghanabhange) and [@NirantK](https://github.com/NirantK)
* [@GalacticMaster](https://github.com/GalacticMaster) for reporting updated contact details
