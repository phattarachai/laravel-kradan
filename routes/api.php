<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Phattarachai\Kradan\Http\Controllers\Api\TokenController;

Route::post('push', [TokenController::class, 'push'])->name('push');
Route::get('boards', [TokenController::class, 'boards'])->name('boards');
Route::get('boards/{slug}/review', [TokenController::class, 'review'])->name('review');
Route::post('boards/{slug}/decide', [TokenController::class, 'decide'])->name('decide');
