# Active Directory API

A .NET 9 Web API for retrieving basic information from Active Directory.

## Features

- Search users by name, display name, or SAM account name
- Get detailed user information
- Search computers by name or description
- Get detailed computer information

## Prerequisites

- .NET 9 SDK
- Access to Active Directory domain
- Windows environment (for System.DirectoryServices)

## Running the API

1. Navigate to the project directory:
   ```bash
   cd ADApi
   ```

2. Restore dependencies:
   ```bash
   dotnet restore
   ```

3. Run the API:
   ```bash
   dotnet run
   ```

The API will be available at `http://localhost:5000`

## API Endpoints

### Users

- `GET /api/users/search?searchTerm={term}` - Search users by name
- `GET /api/users/{samAccountName}` - Get user by SAM account name

### Computers

- `GET /api/computers/search?searchTerm={term}` - Search computers by name
- `GET /api/computers/search/description?searchTerm={term}` - Search computers by description
- `GET /api/computers/{computerName}` - Get computer by name

## Swagger UI

When running in Development mode, Swagger UI is available at:
`http://localhost:5000/swagger`

## CORS

CORS is configured to allow requests from `http://localhost:4200` (Angular dev server).

## Example Requests

### Search Users
```
GET http://localhost:5000/api/users/search?searchTerm=John
```

### Get User Details
```
GET http://localhost:5000/api/users/john.doe
```

### Search Computers
```
GET http://localhost:5000/api/computers/search?searchTerm=PC01
```

### Search Computers by Description
```
GET http://localhost:5000/api/computers/search/description?searchTerm=John
```


