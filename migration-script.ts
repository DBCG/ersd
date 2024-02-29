/**
 * This script is for migration of old hapi server with mysql database to new hapi server with postgres database.
 */
const axios = require("axios");
const readline = require("readline");

// const RESOURCES_TO_MIRATE = ["Person", "Subscription"];

const RESOURCES_TO_MIRATE = ["Bundle"];

const BATCH_COUNT = 5;

const run = async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("Please enter the Base Fhir Server source URL: ", (inputSourceUrl) => {
    rl.question("Please enter the target URL: ", async (inputTargetUrl) => {
      // const sourceFhirServerUrl = sanitizeTrailingSlash(inputSourceUrl);
      // const targetFhirServerUrl = sanitizeTrailingSlash(inputTargetUrl);

      const sourceFhirServerUrl = "http://localhost:8081/hapi-fhir-jpaserver/fhir";
      const targetFhirServerUrl = "http://localhost:8082/fhir";

      if (!checkIfCorrectFhirServer(sourceFhirServerUrl)) {
        throw new Error(`Unable to validate metadata from UR:: ${sourceFhirServerUrl}`, e);
      } else if (!checkIfCorrectFhirServer(targetFhirServerUrl)) {
        throw new Error(`Unable to validate metadata from URL: ${targetFhirServerUrl}`, e);
      }

      try {
        console.log("Querying for resources to migrate...");
        const resourceCollection = await Promise.allSettled(
          RESOURCES_TO_MIRATE.map((resourceType) => retrieveData(sourceFhirServerUrl, resourceType, []))
        );
        resourceCollection.forEach(async (resource, i) => {
          console.log(`Total Resources for '${RESOURCES_TO_MIRATE[i]}' to Migrate:  ${resource?.value?.length}`);
          const transactionBundle = createTransactionBundle(resource?.value);

          const response = await axios({
            url: targetFhirServerUrl,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            data: transactionBundle,
          });
          console.log(response.status, null, 2);
        });
        console.log("************************** Migration Complete **************************");
      } catch (e) {
        console.error("Error migrating resources: ", e);
        throw new Error("Error migrating resources: ", e);
      } finally {
        rl.close();
      }
    });
  });
};

run();

const sanitizeTrailingSlash = (url) => {
  return url.endsWith("/") ? url.slice(0, -1) : url;
};

const checkIfCorrectFhirServer = async (url) => {
  const response = await axios({ url: url + "/metadata", method: "GET" });
  return response.data.resourceType === "CapabilityStatement";
};

const retrieveData = async (url, resourceType, store) => {
  let response = await axios({ url: `${url}/${resourceType}?_count=${BATCH_COUNT}&_format=json`, method: "GET" });
  let data = response.data;
  store = store.concat(data.entry);
  let isNext = data?.link?.find((link) => link.relation === "next");
  const baseUrl = new URL(url);
  while (isNext) {
    const nextUrl = new URL(isNext.url);
    nextUrl.hostname = baseUrl.hostname; // Fix issue with different hostnames in containerized environments
    nextUrl.port = baseUrl.port; // Fix issue with different ports in containerized environments
    console.log("Fetching next batch of resources...", resourceType, nextUrl.href);
    response = await axios({ url: nextUrl.href, method: "GET" });
    data = response.data;
    store = store.concat(data.entry);
    isNext = data?.link?.find((link) => link.relation === "next");
  }
  return store;
};

const createTransactionBundle = (entries) => {
  const entry = entries?.map(({ resource }) => {
    return {
      fullUrl: `${resource.resourceType}/${resource.id}`,
      resource,
      request: {
        method: "PUT",
        url: `${resource.resourceType}/${resource.id}`,
      },
    };
  });
  return {
    resourceType: "Bundle",
    type: "transaction",
    entry,
  };
};