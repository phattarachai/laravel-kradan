<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class ApplyLocale
{
    public function handle(Request $request, Closure $next): Response
    {
        $locale = config('kradan.locale');

        if (is_string($locale) && $locale !== '') {
            app()->setLocale($locale);
        }

        return $next($request);
    }
}
