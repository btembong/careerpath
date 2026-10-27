import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  query(
    @Query('q') q: string = '',
    @Query('type') type: 'courses' | 'teachers' | 'all' = 'all',
  ) {
    return this.searchService.search(q, type);
  }
}
